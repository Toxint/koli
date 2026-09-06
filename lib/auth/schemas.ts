import { z } from "zod";
import { estUnMarcheConnu } from "@/data/markets";

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(3, "Veuillez entrer un numéro de téléphone ou un email valide"),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Le nom doit contenir au moins 2 caractères"),
  phone: z
    .string()
    .min(8, "Numéro de téléphone invalide (au moins 8 chiffres)")
    .regex(/^[0-9+\s-]+$/, "Numéro de téléphone invalide"),
  email: z
    .string()
    .email("Email invalide")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  role: z.enum(["SELLER", "DRIVER", "CLIENT"], {
    message: "Veuillez choisir un rôle valide",
  }),
  businessName: z.string().optional(),
  vehicle: z.string().optional(),
  // Ou le livreur tourne. Borne a 80 : de quoi ecrire trois quartiers, pas
  // de quoi loger un texte dans une liste deroulante.
  zone: z.string().max(80).optional(),
  city: z.string().optional(),
  /**
   * Le pays, contraint à la liste des marchés desservis.
   *
   * Pas un `z.string()` libre : un pays hors couverture produirait une
   * commande impayable — le tunnel iKeePay s'ouvrirait sans proposer un
   * seul opérateur — et une devise repliée en silence sur le franc CFA.
   *
   * Optionnel : les comptes créés par Google n'en fournissent pas, et ce
   * champ ne doit pas bloquer une inscription. Il est alors nul, et
   * `deviseDuVendeur` le dit au lieu de deviner.
   */
  country: z
    .string()
    .refine(estUnMarcheConnu, "Ce pays n'est pas encore desservi par KOLI")
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
