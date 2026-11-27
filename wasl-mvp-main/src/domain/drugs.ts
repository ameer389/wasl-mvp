/**
 * Demo dictionary for the prototype. Not a clinical reference.
 * Production: SFDA Saudi Drug Information System + CHI formulary.
 *
 * - highAlert follows ISMP high-alert categories (anticoagulants, insulin,
 *   opioids, sulfonylureas, digoxin).
 * - informalNamesAr = how patients in Saudi Arabia commonly refer to a medicine.
 *   Several drugs share an informal name (e.g. «حبة السيولة»); the question
 *   planner disambiguates.
 * - No pill colours or shapes on purpose: they vary by manufacturer.
 */

export type TherapeuticClass =
  | 'anticoagulant'
  | 'antiplatelet'
  | 'insulin'
  | 'opioid'
  | 'sulfonylurea'
  | 'cardiac_glycoside'
  | 'analgesic'
  | 'NSAID'
  | 'statin'
  | 'beta_blocker'
  | 'calcium_channel_blocker'
  | 'ARB'
  | 'loop_diuretic'
  | 'biguanide'
  | 'PPI'
  | 'antibiotic'
  | 'thyroid_hormone'
  | 'corticosteroid'
  | 'bronchodilator';

export interface Drug {
  id: string;
  generic: string;
  nameAr: string;
  brands: string[];
  /** Main brand as printed in Arabic on Saudi packs (display only; not used for parsing). */
  brandAr?: string;
  informalNamesAr: string[];
  therapeuticClass: TherapeuticClass;
  ingredient: string[];
  highAlert: boolean;
}

export const DRUGS: readonly Drug[] = [
  // ── High-alert ───────────────────────────────────────────────────────────
  {
    id: 'warfarin',
    generic: 'Warfarin',
    nameAr: 'وارفارين',
    brands: ['Marevan', 'Coumadin'],
    brandAr: 'ماريفان',
    informalNamesAr: ['حبة السيولة', 'مسيل الدم'],
    therapeuticClass: 'anticoagulant',
    ingredient: ['warfarin'],
    highAlert: true,
  },
  {
    id: 'apixaban',
    generic: 'Apixaban',
    nameAr: 'أبيكسابان',
    brands: ['Eliquis'],
    brandAr: 'إليكويس',
    informalNamesAr: ['حبة السيولة', 'مسيل الدم', 'إليكويس'],
    therapeuticClass: 'anticoagulant',
    ingredient: ['apixaban'],
    highAlert: true,
  },
  {
    id: 'rivaroxaban',
    generic: 'Rivaroxaban',
    nameAr: 'ريفاروكسابان',
    brands: ['Xarelto'],
    brandAr: 'زاريلتو',
    informalNamesAr: ['حبة السيولة', 'مسيل الدم', 'زاريلتو'],
    therapeuticClass: 'anticoagulant',
    ingredient: ['rivaroxaban'],
    highAlert: true,
  },
  {
    id: 'enoxaparin',
    generic: 'Enoxaparin',
    nameAr: 'إينوكسابارين',
    brands: ['Clexane'],
    brandAr: 'كليكسان',
    informalNamesAr: ['إبرة السيولة', 'إبرة البطن', 'كليكسان'],
    therapeuticClass: 'anticoagulant',
    ingredient: ['enoxaparin'],
    highAlert: true,
  },
  {
    id: 'insulin-glargine',
    generic: 'Insulin glargine',
    nameAr: 'إنسولين جلارجين',
    brands: ['Lantus', 'Toujeo'],
    brandAr: 'لانتوس',
    informalNamesAr: ['إبرة السكر', 'إبرة السكر الطويلة', 'لانتوس'],
    therapeuticClass: 'insulin',
    ingredient: ['insulin glargine'],
    highAlert: true,
  },
  {
    id: 'insulin-aspart',
    generic: 'Insulin aspart',
    nameAr: 'إنسولين أسبارت',
    brands: ['NovoRapid'],
    brandAr: 'نوفورابيد',
    informalNamesAr: ['إبرة السكر', 'إبرة الأكل', 'نوفورابيد'],
    therapeuticClass: 'insulin',
    ingredient: ['insulin aspart'],
    highAlert: true,
  },
  {
    id: 'tramadol',
    generic: 'Tramadol',
    nameAr: 'ترامادول',
    brands: ['Tramal'],
    brandAr: 'ترامال',
    informalNamesAr: ['المسكن', 'ترامال'],
    therapeuticClass: 'opioid',
    ingredient: ['tramadol'],
    highAlert: true,
  },
  {
    id: 'morphine',
    generic: 'Morphine',
    nameAr: 'مورفين',
    brands: ['MST Continus'],
    informalNamesAr: ['المسكن القوي', 'المورفين'],
    therapeuticClass: 'opioid',
    ingredient: ['morphine'],
    highAlert: true,
  },
  {
    // Codeine is an opioid → ISMP high-alert category.
    id: 'paracetamol-codeine',
    generic: 'Paracetamol + codeine',
    nameAr: 'باراسيتامول مع كودايين',
    brands: ['Co-codamol'],
    informalNamesAr: ['المسكن', 'مسكن العملية'],
    therapeuticClass: 'opioid',
    ingredient: ['paracetamol', 'codeine'],
    highAlert: true,
  },
  {
    id: 'gliclazide',
    generic: 'Gliclazide',
    nameAr: 'جليكلازايد',
    brands: ['Diamicron'],
    brandAr: 'دياميكرون',
    informalNamesAr: ['حبوب السكر', 'دياميكرون'],
    therapeuticClass: 'sulfonylurea',
    ingredient: ['gliclazide'],
    highAlert: true,
  },
  {
    id: 'digoxin',
    generic: 'Digoxin',
    nameAr: 'ديجوكسين',
    brands: ['Lanoxin'],
    brandAr: 'لانوكسين',
    informalNamesAr: ['حبة القلب', 'لانوكسين'],
    therapeuticClass: 'cardiac_glycoside',
    ingredient: ['digoxin'],
    highAlert: true,
  },

  // ── Other common discharge medicines ─────────────────────────────────────
  {
    id: 'paracetamol',
    generic: 'Paracetamol',
    nameAr: 'باراسيتامول',
    brands: ['Panadol', 'Adol', 'Fevadol'],
    brandAr: 'بنادول',
    informalNamesAr: ['بنادول', 'أدول', 'المسكن', 'حبة الحرارة'],
    therapeuticClass: 'analgesic',
    ingredient: ['paracetamol'],
    highAlert: false,
  },
  {
    id: 'ibuprofen',
    generic: 'Ibuprofen',
    nameAr: 'إيبوبروفين',
    brands: ['Brufen', 'Profinal'],
    brandAr: 'بروفين',
    informalNamesAr: ['بروفين', 'المسكن', 'مضاد الالتهاب'],
    therapeuticClass: 'NSAID',
    ingredient: ['ibuprofen'],
    highAlert: false,
  },
  {
    id: 'aspirin',
    generic: 'Aspirin',
    nameAr: 'أسبرين',
    brands: ['Aspocid', 'Jusprin'],
    brandAr: 'أسبوسيد',
    informalNamesAr: ['الأسبرين', 'أسبوسيد', 'مسيل الدم'],
    therapeuticClass: 'antiplatelet',
    ingredient: ['acetylsalicylic acid'],
    highAlert: false,
  },
  {
    id: 'clopidogrel',
    generic: 'Clopidogrel',
    nameAr: 'كلوبيدوقريل',
    brands: ['Plavix'],
    brandAr: 'بلافكس',
    informalNamesAr: ['بلافكس', 'حبة السيولة', 'مسيل الدم'],
    therapeuticClass: 'antiplatelet',
    ingredient: ['clopidogrel'],
    highAlert: false,
  },
  {
    id: 'atorvastatin',
    generic: 'Atorvastatin',
    nameAr: 'أتورفاستاتين',
    brands: ['Lipitor'],
    brandAr: 'ليبيتور',
    informalNamesAr: ['حبوب الكوليسترول', 'حبة الدهون', 'ليبيتور'],
    therapeuticClass: 'statin',
    ingredient: ['atorvastatin'],
    highAlert: false,
  },
  {
    id: 'bisoprolol',
    generic: 'Bisoprolol',
    nameAr: 'بيسوبرولول',
    brands: ['Concor'],
    brandAr: 'كونكور',
    informalNamesAr: ['حبة القلب', 'حبة الضغط', 'كونكور'],
    therapeuticClass: 'beta_blocker',
    ingredient: ['bisoprolol'],
    highAlert: false,
  },
  {
    id: 'amlodipine',
    generic: 'Amlodipine',
    nameAr: 'أملوديبين',
    brands: ['Norvasc'],
    brandAr: 'نورفاسك',
    informalNamesAr: ['حبة الضغط', 'نورفاسك'],
    therapeuticClass: 'calcium_channel_blocker',
    ingredient: ['amlodipine'],
    highAlert: false,
  },
  {
    id: 'losartan',
    generic: 'Losartan',
    nameAr: 'لوسارتان',
    brands: ['Cozaar'],
    brandAr: 'كوزار',
    informalNamesAr: ['حبة الضغط', 'كوزار'],
    therapeuticClass: 'ARB',
    ingredient: ['losartan'],
    highAlert: false,
  },
  {
    id: 'furosemide',
    generic: 'Furosemide',
    nameAr: 'فوروسيمايد',
    brands: ['Lasix'],
    brandAr: 'لازكس',
    informalNamesAr: ['حبة المويه', 'حبة المدرّ', 'لازكس'],
    therapeuticClass: 'loop_diuretic',
    ingredient: ['furosemide'],
    highAlert: false,
  },
  {
    id: 'metformin',
    generic: 'Metformin',
    nameAr: 'ميتفورمين',
    brands: ['Glucophage'],
    brandAr: 'جلوكوفاج',
    informalNamesAr: ['حبوب السكر', 'جلوكوفاج'],
    therapeuticClass: 'biguanide',
    ingredient: ['metformin'],
    highAlert: false,
  },
  {
    id: 'omeprazole',
    generic: 'Omeprazole',
    nameAr: 'أوميبرازول',
    brands: ['Losec', 'Risek'],
    brandAr: 'لوسك',
    informalNamesAr: ['حبة المعدة', 'دواء الحموضة', 'ريسك'],
    therapeuticClass: 'PPI',
    ingredient: ['omeprazole'],
    highAlert: false,
  },
  {
    id: 'esomeprazole',
    generic: 'Esomeprazole',
    nameAr: 'إيسوميبرازول',
    brands: ['Nexium'],
    brandAr: 'نكسيوم',
    informalNamesAr: ['حبة المعدة', 'دواء الحموضة', 'نكسيوم'],
    therapeuticClass: 'PPI',
    ingredient: ['esomeprazole'],
    highAlert: false,
  },
  {
    id: 'amoxicillin-clavulanate',
    generic: 'Amoxicillin + clavulanate',
    nameAr: 'أموكسيسيلين مع كلافيولانيت',
    brands: ['Augmentin'],
    brandAr: 'أوجمنتين',
    informalNamesAr: ['المضاد', 'المضاد الحيوي', 'أوجمنتين'],
    therapeuticClass: 'antibiotic',
    ingredient: ['amoxicillin', 'clavulanic acid'],
    highAlert: false,
  },
  {
    id: 'levothyroxine',
    generic: 'Levothyroxine',
    nameAr: 'ليفوثيروكسين',
    brands: ['Euthyrox', 'Eltroxin'],
    brandAr: 'يوثيروكس',
    informalNamesAr: ['حبة الغدة', 'دواء الغدة'],
    therapeuticClass: 'thyroid_hormone',
    ingredient: ['levothyroxine'],
    highAlert: false,
  },
  {
    id: 'prednisolone',
    generic: 'Prednisolone',
    nameAr: 'بريدنيزولون',
    brands: ['Deltacortril'],
    informalNamesAr: ['الكورتيزون', 'حبوب الكورتيزون'],
    therapeuticClass: 'corticosteroid',
    ingredient: ['prednisolone'],
    highAlert: false,
  },
  {
    id: 'salbutamol',
    generic: 'Salbutamol inhaler',
    nameAr: 'سالبيوتامول (بخاخ)',
    brands: ['Ventolin'],
    brandAr: 'فنتولين',
    informalNamesAr: ['البخاخ', 'بخاخ الربو', 'فنتولين'],
    therapeuticClass: 'bronchodilator',
    ingredient: ['salbutamol'],
    highAlert: false,
  },
];

const BY_ID: ReadonlyMap<string, Drug> = new Map(DRUGS.map((d) => [d.id, d]));

export function getDrug(id: string): Drug | undefined {
  return BY_ID.get(id);
}

/** Like getDrug, but throws on unknown ids (plans must only reference known drugs). */
export function requireDrug(id: string): Drug {
  const drug = BY_ID.get(id);
  if (!drug) throw new Error(`Unknown drug id: ${id}`);
  return drug;
}

/** Classes where two concurrent drugs are flagged as possible duplicate therapy. */
export const DUPLICATE_CLASSES: ReadonlySet<TherapeuticClass> = new Set<TherapeuticClass>([
  'anticoagulant',
  'antiplatelet',
  'PPI',
  'NSAID',
  'opioid',
  'sulfonylurea',
]);

export type DuplicateMatch =
  | { kind: 'INGREDIENT'; ingredient: string }
  | { kind: 'CLASS'; therapeuticClass: TherapeuticClass };

/**
 * Do two drugs overlap? Shared active ingredient first (e.g. paracetamol inside a
 * combination product), otherwise the same class within DUPLICATE_CLASSES.
 * Returns null for unknown ids or no overlap.
 */
export function findDuplicates(drugIdA: string, drugIdB: string): DuplicateMatch | null {
  const a = BY_ID.get(drugIdA);
  const b = BY_ID.get(drugIdB);
  if (!a || !b) return null;
  const shared = a.ingredient.find((i) => b.ingredient.includes(i));
  if (shared) return { kind: 'INGREDIENT', ingredient: shared };
  if (a.therapeuticClass === b.therapeuticClass && DUPLICATE_CLASSES.has(a.therapeuticClass)) {
    return { kind: 'CLASS', therapeuticClass: a.therapeuticClass };
  }
  return null;
}
