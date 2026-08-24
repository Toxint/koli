import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Marquage comme lu — le contrôle d'accès (§45, §47).
 *
 * La portée `userId` du `updateMany` n'est pas un filtre de confort : c'est le
 * contrôle d'accès lui-même. Sans elle, un identifiant fabriqué permettrait de
 * marquer lues les notifications de quelqu'un d'autre — donc de les faire
 * disparaître de sa vue, donc de lui cacher un litige ou un paiement.
 *
 * Cela se vérifie sur l'appel, pas depuis un navigateur : c'est la forme de la
 * requête envoyée à la base qui fait foi.
 */

const prismaMock = {
  notification: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
};

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/actions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { marquerNotificationLueAction, toutMarquerLuAction } = await import(
  "@/lib/notifications/actions"
);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
});

describe("marquerNotificationLueAction", () => {
  it("refuse un visiteur non connecte, sans toucher a la base", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await marquerNotificationLueAction("n1");

    expect(res.success).toBe(false);
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("borne l'ecriture au compte de la session — jamais a l'identifiant seul", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-moi", role: "CLIENT" });

    await marquerNotificationLueAction("n-de-quelqu-un-d-autre");

    const where = prismaMock.notification.updateMany.mock.calls[0][0].where;
    // LE point : `userId` vient de la session. Un identifiant de notification
    // appartenant a un autre compte ne trouve simplement rien a modifier.
    expect(where.userId).toBe("u-moi");
    expect(where.id).toBe("n-de-quelqu-un-d-autre");
  });

  it("reste idempotent : ne deplace pas une date de lecture deja posee", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-moi", role: "CLIENT" });

    await marquerNotificationLueAction("n1");

    // `readAt: null` dans la clause : rejouee, l'action ne reecrit pas l'heure
    // de la premiere lecture.
    expect(prismaMock.notification.updateMany.mock.calls[0][0].where.readAt).toBeNull();
  });
});

describe("toutMarquerLuAction", () => {
  it("refuse un visiteur non connecte", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await toutMarquerLuAction();

    expect(res.success).toBe(false);
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("ne vide QUE sa propre boite", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-moi", role: "SELLER" });

    await toutMarquerLuAction();

    expect(prismaMock.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: "u-moi",
      readAt: null,
    });
  });

  it("le dit sobrement quand il n'y avait rien a marquer", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-moi", role: "SELLER" });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

    const res = await toutMarquerLuAction();

    expect(res.success).toBe(true);
    expect(res).toHaveProperty("message");
    if ("message" in res) expect(res.message).toMatch(/aucune/i);
  });
});
