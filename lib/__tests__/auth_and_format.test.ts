import { describe, it, expect } from "vitest";
import { formatCFA, isValidLocalPhone } from "../format";
import { hashPassword, verifyPassword } from "../auth/password";
import { encryptSession, decryptSession } from "../auth/session";
import { UserRole } from "@prisma/client";

describe("Formatting Utils", () => {
  it("formats amounts in FCFA with thousands separator", () => {
    expect(formatCFA(18500)).toBe("18 500 FCFA");
    expect(formatCFA(1000000)).toBe("1 000 000 FCFA");
    expect(formatCFA(500)).toBe("500 FCFA");
  });

  it("validates local phone numbers", () => {
    expect(isValidLocalPhone("0701020304")).toBe(true);
    expect(isValidLocalPhone("07 01 02 03 04")).toBe(true);
    expect(isValidLocalPhone("123")).toBe(false);
  });
});

describe("Auth Password Utils", () => {
  it("hashes and verifies passwords correctly", async () => {
    const password = "Password123!";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrong = await verifyPassword("WrongPassword", hash);
    expect(isWrong).toBe(false);
  });
});

describe("Auth Session Utils", () => {
  it("encrypts and decrypts JWT session payloads", async () => {
    const payload = {
      userId: "usr-123",
      role: UserRole.SELLER,
      name: "Boutique Test",
      phone: "+2250700000000",
    };

    const token = await encryptSession(payload);
    expect(typeof token).toBe("string");

    const decrypted = await decryptSession(token);
    expect(decrypted).not.toBeNull();
    expect(decrypted?.userId).toBe(payload.userId);
    expect(decrypted?.role).toBe(payload.role);
    expect(decrypted?.name).toBe(payload.name);
  });

  it("returns null for invalid JWT tokens", async () => {
    const decrypted = await decryptSession("invalid.token.here");
    expect(decrypted).toBeNull();
  });
});
