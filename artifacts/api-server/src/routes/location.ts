import { createHmac, randomInt } from "node:crypto";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AcceptInviteParams,
  GetConnectionsResponse,
  GetMyProfileResponse,
  PreviewInviteParams,
  PreviewInviteResponse,
  SaveMyProfileBody,
  SaveMyProfileResponse,
  UpdateLocationBody,
  UpdateLocationResponse,
  UpdateSharingBody,
  UpdateSharingResponse,
} from "@workspace/api-zod";
import {
  db,
  locationConnectionsTable,
  locationInvitesTable,
  locationUsersTable,
} from "@workspace/db";
import { requireUser, signedInUserId } from "../middlewares/requireUser";

const router: IRouter = Router();
router.use(requireUser);

const failedInviteAttempts = new Map<
  string,
  { count: number; resetsAt: number }
>();

function canTryInvite(userId: string): boolean {
  const now = Date.now();
  const current = failedInviteAttempts.get(userId);
  if (!current || current.resetsAt <= now) {
    failedInviteAttempts.set(userId, {
      count: 0,
      resetsAt: now + 15 * 60 * 1000,
    });
    return true;
  }
  return current.count < 10;
}

function recordFailedInvite(userId: string): void {
  const current = failedInviteAttempts.get(userId);
  if (current) current.count += 1;
}

function clearInviteAttempts(userId: string): void {
  failedInviteAttempts.delete(userId);
}

function digestInviteCode(code: string): string {
  const pepper = process.env.CLERK_SECRET_KEY;
  if (!pepper) throw new Error("CLERK_SECRET_KEY is required to protect invite codes.");
  return createHmac("sha256", pepper).update(code).digest("hex");
}

router.get("/me", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const [profile] = await db
    .select({
      userId: locationUsersTable.userId,
      displayName: locationUsersTable.displayName,
      sharingEnabled: locationUsersTable.sharingEnabled,
    })
    .from(locationUsersTable)
    .where(eq(locationUsersTable.userId, userId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "No se encontró tu perfil." });
    return;
  }
  res.json(GetMyProfileResponse.parse(profile));
});

router.put("/me", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const parsed = SaveMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(locationUsersTable)
    .values({
      userId,
      displayName: parsed.data.displayName.trim(),
      email: parsed.data.email ?? null,
    })
    .onConflictDoUpdate({
      target: locationUsersTable.userId,
      set: {
        displayName: parsed.data.displayName.trim(),
        email: parsed.data.email ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({
      userId: locationUsersTable.userId,
      displayName: locationUsersTable.displayName,
      sharingEnabled: locationUsersTable.sharingEnabled,
    });

  res.json(SaveMyProfileResponse.parse(profile));
});

router.post("/invites", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const [profile] = await db
    .select({ userId: locationUsersTable.userId })
    .from(locationUsersTable)
    .where(eq(locationUsersTable.userId, userId))
    .limit(1);
  if (!profile) {
    res.status(409).json({ error: "Primero debes completar tu perfil." });
    return;
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  let issuedCode = "";
  await db.transaction(async (tx) => {
    await tx
      .delete(locationInvitesTable)
      .where(eq(locationInvitesTable.ownerId, userId));

    let saved = false;
    for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
      const candidate = randomInt(0, 100_000).toString().padStart(5, "0");
      const inserted = await tx
        .insert(locationInvitesTable)
        .values({
          code: digestInviteCode(candidate),
          ownerId: userId,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning({ code: locationInvitesTable.code });
      if (inserted.length > 0) {
        issuedCode = candidate;
        saved = true;
      }
    }
    if (!saved) throw new Error("Unable to allocate a unique invite code.");
  });

  res.status(201).json({ code: issuedCode, expiresAt: expiresAt.toISOString() });
});

router.get("/invites/:code", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  if (!canTryInvite(userId)) {
    res.status(429).json({ error: "Demasiados intentos. Prueba en 15 minutos." });
    return;
  }
  const params = PreviewInviteParams.safeParse(req.params);
  if (!params.success) {
    recordFailedInvite(userId);
    res.status(404).json({ error: "Código inválido o vencido." });
    return;
  }

  const [invite] = await db
    .select({
      ownerId: locationInvitesTable.ownerId,
      displayName: locationUsersTable.displayName,
    })
    .from(locationInvitesTable)
    .innerJoin(
      locationUsersTable,
      eq(locationUsersTable.userId, locationInvitesTable.ownerId),
    )
    .where(
      and(
        eq(locationInvitesTable.code, digestInviteCode(params.data.code)),
        gt(locationInvitesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invite || invite.ownerId === userId) {
    recordFailedInvite(userId);
    res.status(404).json({ error: "Código inválido o vencido." });
    return;
  }
  clearInviteAttempts(userId);
  res.json(PreviewInviteResponse.parse({ displayName: invite.displayName }));
});

router.post("/invites/:code/accept", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  if (!canTryInvite(userId)) {
    res.status(429).json({ error: "Demasiados intentos. Prueba en 15 minutos." });
    return;
  }
  const params = AcceptInviteParams.safeParse(req.params);
  if (!params.success) {
    recordFailedInvite(userId);
    res.status(404).json({ error: "Código inválido o vencido." });
    return;
  }

  const [invite] = await db
    .select({
      ownerId: locationInvitesTable.ownerId,
      displayName: locationUsersTable.displayName,
    })
    .from(locationInvitesTable)
    .innerJoin(
      locationUsersTable,
      eq(locationUsersTable.userId, locationInvitesTable.ownerId),
    )
    .where(
      and(
        eq(locationInvitesTable.code, digestInviteCode(params.data.code)),
        gt(locationInvitesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invite) {
    recordFailedInvite(userId);
    res.status(404).json({ error: "Código inválido o vencido." });
    return;
  }
  if (invite.ownerId === userId) {
    res.status(409).json({ error: "No puedes agregar tu propio código." });
    return;
  }

  const userA = userId < invite.ownerId ? userId : invite.ownerId;
  const userB = userId < invite.ownerId ? invite.ownerId : userId;
  const existing = await db
    .select({ userA: locationConnectionsTable.userA })
    .from(locationConnectionsTable)
    .where(
      and(
        eq(locationConnectionsTable.userA, userA),
        eq(locationConnectionsTable.userB, userB),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Estas cuentas ya están vinculadas." });
    return;
  }

  const pairing = await db.transaction(async (tx) => {
    const [consumed] = await tx
      .delete(locationInvitesTable)
      .where(
        and(
          eq(locationInvitesTable.code, digestInviteCode(params.data.code)),
          gt(locationInvitesTable.expiresAt, new Date()),
        ),
      )
      .returning({ ownerId: locationInvitesTable.ownerId });
    if (!consumed) return { status: "expired" as const };

    const [created] = await tx
      .insert(locationConnectionsTable)
      .values({ userA, userB })
      .onConflictDoNothing()
      .returning({ userA: locationConnectionsTable.userA });
    if (!created) return { status: "existing" as const };
    return { status: "created" as const, ownerId: consumed.ownerId };
  });
  if (pairing.status === "expired") {
    recordFailedInvite(userId);
    res.status(404).json({ error: "Código inválido o vencido." });
    return;
  }
  if (pairing.status === "existing") {
    res.status(409).json({ error: "Estas cuentas ya están vinculadas." });
    return;
  }

  const [connection] = await db
    .select({
      userId: locationUsersTable.userId,
      displayName: locationUsersTable.displayName,
      latitude: locationUsersTable.latitude,
      longitude: locationUsersTable.longitude,
      locationUpdatedAt: locationUsersTable.locationUpdatedAt,
      sharingEnabled: locationUsersTable.sharingEnabled,
    })
    .from(locationUsersTable)
    .where(eq(locationUsersTable.userId, pairing.ownerId))
    .limit(1);

  clearInviteAttempts(userId);
  res.status(201).json(
    {
      ...connection,
      latitude: connection.sharingEnabled ? connection.latitude : null,
      longitude: connection.sharingEnabled ? connection.longitude : null,
      locationUpdatedAt: connection.sharingEnabled
        ? connection.locationUpdatedAt?.toISOString() ?? null
        : null,
    },
  );
});

router.get("/connections", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const pairs = await db
    .select({
      userA: locationConnectionsTable.userA,
      userB: locationConnectionsTable.userB,
    })
    .from(locationConnectionsTable)
    .where(
      or(
        eq(locationConnectionsTable.userA, userId),
        eq(locationConnectionsTable.userB, userId),
      ),
    );
  const peerIds = pairs.map((pair) =>
    pair.userA === userId ? pair.userB : pair.userA,
  );
  if (peerIds.length === 0) {
    res.json([]);
    return;
  }

  const [viewer] = await db
    .select({ sharingEnabled: locationUsersTable.sharingEnabled })
    .from(locationUsersTable)
    .where(eq(locationUsersTable.userId, userId))
    .limit(1);
  const peers = await db
    .select({
      userId: locationUsersTable.userId,
      displayName: locationUsersTable.displayName,
      latitude: locationUsersTable.latitude,
      longitude: locationUsersTable.longitude,
      locationUpdatedAt: locationUsersTable.locationUpdatedAt,
      sharingEnabled: locationUsersTable.sharingEnabled,
    })
    .from(locationUsersTable)
    .where(inArray(locationUsersTable.userId, peerIds));
  const mutuallySharing = Boolean(viewer?.sharingEnabled);

  res.json(
    GetConnectionsResponse.parse(
      peers.map((peer) => {
        const canSeeLocation = mutuallySharing && peer.sharingEnabled;
        return {
          ...peer,
          latitude: canSeeLocation ? peer.latitude : null,
          longitude: canSeeLocation ? peer.longitude : null,
          locationUpdatedAt: canSeeLocation
            ? peer.locationUpdatedAt?.toISOString() ?? null
            : null,
        };
      }),
    ),
  );
});

router.delete("/connections/:userId", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const peerId = req.params.userId;
  const userA = userId < peerId ? userId : peerId;
  const userB = userId < peerId ? peerId : userId;
  const removed = await db
    .delete(locationConnectionsTable)
    .where(
      and(
        eq(locationConnectionsTable.userA, userA),
        eq(locationConnectionsTable.userB, userB),
      ),
    )
    .returning({ userA: locationConnectionsTable.userA });
  if (removed.length === 0) {
    res.status(404).json({ error: "No se encontró esta conexión." });
    return;
  }
  res.sendStatus(204);
});

router.put("/location", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db
    .select({ sharingEnabled: locationUsersTable.sharingEnabled })
    .from(locationUsersTable)
    .where(eq(locationUsersTable.userId, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "No se encontró tu perfil." });
    return;
  }
  if (!user.sharingEnabled) {
    res.status(409).json({ error: "Activa compartir ubicación primero." });
    return;
  }

  const updatedAt = new Date();
  await db
    .update(locationUsersTable)
    .set({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracy: parsed.data.accuracy ?? null,
      locationUpdatedAt: updatedAt,
      updatedAt,
    })
    .where(eq(locationUsersTable.userId, userId));
  res.json(UpdateLocationResponse.parse({ updatedAt: updatedAt.toISOString() }));
});

router.patch("/sharing", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  const parsed = UpdateSharingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [profile] = await db
    .update(locationUsersTable)
    .set({
      sharingEnabled: parsed.data.enabled,
      updatedAt: new Date(),
    })
    .where(eq(locationUsersTable.userId, userId))
    .returning({ enabled: locationUsersTable.sharingEnabled });
  if (!profile) {
    res.status(404).json({ error: "No se encontró tu perfil." });
    return;
  }
  res.json(UpdateSharingResponse.parse(profile));
});

export default router;
