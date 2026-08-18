import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "../auth/schemas";

describe("Auth Validation Schemas", () => {
  it("validates login input correctly", () => {
    const valid = loginSchema.safeParse({
      identifier: "vendeur@koli.ci",
      password: "Password123!",
    });
    expect(valid.success).toBe(true);

    const invalid = loginSchema.safeParse({
      identifier: "ab",
      password: "123",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates registration input correctly for SELLER role", () => {
    const valid = registerSchema.safeParse({
      name: "Boutique Test",
      phone: "+2250700000000",
      email: "test@koli.ci",
      password: "Password123!",
      role: "SELLER",
      businessName: "Boutique Test SARL",
    });
    expect(valid.success).toBe(true);

    const invalidPhone = registerSchema.safeParse({
      name: "Boutique Test",
      phone: "123",
      password: "Password123!",
      role: "SELLER",
    });
    expect(invalidPhone.success).toBe(false);
  });
});
