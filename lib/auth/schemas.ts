import { z } from "zod";
import { estUnMarcheConnu, SYMBOLE } from "@/data/markets";

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
  /**
   * La devise CHOISIE, quand le vendeur en choisit une.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Le pays ne dit pas toujours la monnaie. À Kinshasa, une part        │
   * │  importante du commerce s'affiche en dollars.                        │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Contrainte à la liste connue, pour la même raison que le pays : une
   * devise inconnue produirait un montant sans unité, ou replié en silence
   * sur le franc CFA.
   *
   * **Vide ⇒ absente**, et non « XOF ». Le formulaire propose « celle de mon
   * pays » comme première option : elle envoie une chaîne vide, et c'est
   * `deviseDuVendeur` qui retombe alors sur le pays. Écrire une devise ici
   * quand personne n'en a choisi transformerait un repli — révisable — en
   * décision figée.
   */
  currency: z
    .string()
    .refine((v) => v === "" || v in SYMBOLE, "Cette devise n'est pas reconnue")
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
