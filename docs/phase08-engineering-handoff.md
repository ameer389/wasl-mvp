# WASL · تقرير Phase 08 وتسليم العقود الهندسية

## A. القرار التنفيذي

**READY FOR UI/UX ضمن Hackathon MVP.** اجتاز مريض اصطناعي أُنشئ من الواجهة دورة الخروج والمتابعة والإغلاق وإعادة الفتح على نسخة الإنتاج. نجحت الاختبارات الهندسية والبيانات الاصطناعية. يظل `VO-02` بحالة `PARTIAL`. التحقق من الميكروفون الحقيقي، التثبيت النظيف في البيئة المعزولة، وتقييم الاستخدام السريري الفعلي محدودة كما هو موضح في القسم I. هذا القرار يخص التنفيذ الحالي.

استُعيد تقرير Phase 01 الأصلي وسجل اختباره من جلسة Codex السابقة، واستُعيدت نقاط تحقق Phases 02–07 والآثار التاريخية من الملفات المحلية. أُعيد تشغيل خط أساس Phase 07 قبل تعديلات Phase 08، ثم شُغّل التحقق على التنفيذ النهائي. نسخة العمل لا تحتوي على Git metadata، ولذلك استُخدمت مقارنة الملفات وبصمات SHA-256.

## B. المحركات الستة

| المحرك | الوظيفة والتحقق | المدخلات والمخرجات المشتركة | الحالة |
|---|---|---|---|
| Executable Care Graph | توليد المهام وإظهار المالك والخطر والمواعيد والعلاقات وحدود العلاج. اختبار موعد اليوم 30 لمريض خرج متأخراً | `DischargePlan → CareTask[]` إلى Planner وGap Engine | CLOSED |
| Medication Truth Layer | فصل التقرير الفعّال عن التاريخ والتصحيح، ربط التقرير المفتوح بالمادة الدوائية، وإبقاء الغموض للمراجعة | `Evidence[] → reconcileMedications` إلى التحقق والواجهة وPlanner | CLOSED |
| Saudi Arabic Voice AI | تفسير مرتبط بالسؤال والدواء، echo وتصحيح الأسماء وعائلة وبدائل نصية. تحقق Chrome بمحاكاة SpeechRecognition | `Question → ParseResult → Evidence` بدرجتي ثقة مستقلتين عند توفرهما | PARTIAL · VO-02. الميكروفون الحقيقي غير مختبر |
| Uncertainty-Driven Follow-up | جدولة مبنية على الدليل والخطر والسجل والحصة، ثبات الجلسة، وإعادة واحدة للسؤال المفتوح المتروك | `CareTask[] + Evaluation + AuditEntry[] → QuestionPlan` | CLOSED |
| Care Gap Detection | 12 قاعدة مستقلة، أهلية المصدر والواقعة، أولوية وسبب وإحالة داخل المحاكاة | `Evaluation` يشمل `taskStatus` و`followup` و`conditions` و`gaps` | CLOSED |
| Closed Care Loop | اتصال، تدخل، انتظار الدليل، إعادة التحقق، إغلاق بنوعين، إعادة فتح مرتبطة بالواقعة، Undo محدد وتاريخ محفوظ | `Gap` و`GapResolution` و`GapObservation` عبر reducer وAudit | CLOSED |

## C. إغلاق نتائج Phase 01

أدلة الاختبار أدناه تُقرأ مع التشغيل النهائي. حالة `CLOSED` تعني أن العطل الأصلي لا يظهر في السيناريوهات المعادة ضمن نطاق MVP. تحفظ صفوف `PARTIAL` والقيود شروط الإثبات.

| ID | النتيجة الحالية وإمكانية إعادة العطل | دليل التحقق وحد النطاق |
|---|---|---|
| CG-01 | CLOSED · علاقة بدء/استمرار تؤثر في ترتيب السؤال. علاقات الحجز والمختبر مع الحضور سياقية. إتمام مهمة مثبتة يظل مستقلاً | `careGraph.test.ts`، `questionPlanner.test.ts`، `gapEngine.test.ts`، مسار Chrome الجديد |
| CG-02 | CLOSED · اليوم 30 ممكن للمريض المتأخر مع هامش يومين لتقييم التأخر | `src/domain/time.ts`، `simulationHorizon`، فحص Chrome Day 30 وFit وScroll وreload |
| CG-03 | CLOSED · حد العلاج شامل لليوم المعرّف ويمنع توليد استمرار بعده | `careGraph.test.ts`، `gapEvidence.test.ts`، Apixaban في Chrome له Day 3 ولا Day 7. المدة تُدخل صراحة |
| CG-04 | CLOSED · المرجع اليتيم والمعرفات المكررة والخطة المحفوظة غير الصالحة تُرفض أو تُعالج قبل بناء الرسم | `planForm`، `isDemoState`، `store.test.ts`، مراجعة Chrome لإزالة دواء مرتبط |
| MT-01 | CLOSED · التصحيح اللاحق يزيل أثر الادعاء السابق ويحفظه في التاريخ. `NONE` يصف جواباً جديداً فقط | `reconcileMedications`، `medicationEvidence.test.ts`، `gapLifecycle.test.ts`، Chrome تصحيح الدواء |
| MT-02 | CLOSED · الدليل الدوائي الغامض أو الضعيف يصل للمراجعة بالهوية المتاحة ويظل غير حاسم | `medicationEvidence.test.ts`، `gapEngine.test.ts`، `voiceAnswers.test.ts`، مسار Chrome |
| MT-03 | CLOSED · العرض والمحرك يستهلكان التسلسل والتحكيم نفسيهما، مع بقاء التاريخ منفصلاً | `ExpectedActualTab`، `CareGraphTab`، `medicationEvidence.test.ts`، `gapEvidence.test.ts` |
| VO-01 | CLOSED · اسم غير متعلق بالسؤال لا يثبت المهمة، وإشارة دوائية وحدها لا تحسم `YES_NO` | `voiceAnswers.test.ts`، `arabicParser.test.ts`، Chrome A |
| VO-02 | PARTIAL · النفي والشرط والتاريخ والجرعة غير المحددة لها حواجز. لا تزال بعض صيغ الاستمرار والمدة المبهمة والضمائر المتصلة تذهب للمراجعة | `voiceAnswers.test.ts`، `parser-results.phase04b.json`، Chrome B/F/G/H. لا مقارنة عددية مع جرعة الخطة |
| VO-03 | CLOSED · إزالة آخر اسم في echo تحفظ `DISCARDED` دون تقرير وهمي، مع استمرار مسار محاولة أخرى | `withKeptMeds`، `checkin.test.ts`، Chrome D |
| VO-04 | CLOSED لآليات MVP · غياب ASR confidence وتعارض البدائل وأخطاء الالتقاط والإلغاء ومسار النص تعمل في المحاكاة | `useSpeechRecognition`، `interpretSpeech` في `speechAnswer.ts`، Chrome E. دقة ASR الحي غير مقاسة |
| QP-01 | CLOSED · السلب المؤهل وغياب feed والإغلاق الإداري تبقى ضمن منطق المتابعة، مع تعليق التكرار حيث تغطيه مراجعة مناسبة | `questionPlanner.test.ts`، `gapEvidence.test.ts`، `gapLifecycle.test.ts` |
| QP-02 | CLOSED · ترتيب وحصة ومهل إعادة مع تعزيز المهام المؤجلة. سؤال `OPEN_MEDS` المتروك يملك فرصة واحدة، والمجاب يتوقف لنفس اليوم | `questionPlanner.test.ts`، `store.test.ts`، Chrome D/F والمسار الجديد |
| GAP-01 | CLOSED · دليل سلبي أحدث وفعّال يعيد التقييم. الغموض الأحدث أو تعارض المصدر له مسار مراجعة مناسب | `gapEvidence.test.ts`، `gapEngine.test.ts` و`reconcileMedications` |
| GAP-02 | CLOSED · الصرف لا يثبت الاستخدام، والسجل منخفض الثقة أو غير المطابق لا يثبت الحضور أو النتيجة | `gapEvidence.test.ts`، `safety.test.ts`، `store.test.ts`. توافق legacy محدود |
| GAP-03 | CLOSED · توجد قواعد منفصلة للسلب الصريح والحضور المُبلّغ عنه كمفوّت وللحضور غير المؤكد | `TASK_NOT_COMPLETED` و`FOLLOWUP_MISSED` و`FOLLOWUP_ATTENDANCE_UNCONFIRMED`، focused Phase 06 |
| GAP-04 | CLOSED · عناوين غياب المختبر والحجز وصفية، والأدلة المساندة تظهر مع السبب | `labels.ts`، `gapEvidence.test.ts`، `GapCard` ومسار Chrome |
| GAP-05 | CLOSED · التجميع حسب مفتاح الفجوة والتقرير، وأسباب الأولوية من الدليل الساري. `PATIENT_REMINDER` متابعة داخل التطبيق | `gapEngine.test.ts`، `gapEvidence.test.ts`، `phase06-coverage.md` |
| LOOP-01 | CLOSED · `Gap closed` حالة قرار إداري، و`Verified` يعتمد على الدليل. الخطر المؤرشف ظاهر في Overview | `gapLifecycle.test.ts`، Chrome C والمسار الجديد |
| LOOP-02 | CLOSED · التكرار بنفس الحدث مستقر، والإفادة المستقلة بعد قرار تستدعي إعادة المراجعة عند الأهلية حتى في اليوم نفسه | `gapLifecycle.test.ts`، `lifecycleFor`، `observeLifecycle`، Chrome A/B |
| LOOP-03 | CLOSED · أحداث الكشف والإغلاق وإعادة الفتح محفوظة والمراجعة مرتبطة بـ episode/revision | `gapLifecycle.test.ts`، `patientAuditTrail`، Chrome reload وrewind |
| LOOP-04 | CLOSED · Undo يعكس `resolutionSeq` المحدد ويحفظ أعمال المرضى والسجل والوقت والأسئلة | `gapLifecycle.test.ts`، Chrome D. النداء المكرر أو القديم مرفوض |
| LOOP-05 | CLOSED · سبب وملاحظة لازمان للإغلاق الإداري، وإثبات مؤهل وإشارة إليه لازمان للإغلاق المدعوم | `demoReducer`، `gapLifecycle.test.ts`، المسار الجديد |
| VAL-01 | CLOSED لسلامة العرض وإعادة الإنتاج الهندسي · Phase 04B فعلياً هو المصدر الحالي، والقياس يفصل التخطيط والـreplay عن السلوك الفعلي | `scripts/validate.ts`، `Validation.tsx`، Smoke Chrome. التقييم المستقل والسريري `ACCEPTED LIMITATION` |

## D. المريض الجديد من الواجهة إلى إعادة الفتح

1. من `/clinician/new?sample=1` حُمّل نموذج اصطناعي وعدّل ثم حُفظ من الواجهة. أنشأ `pt-007` في Global Day 4 وPatient Day 0، بلا أدلة سابقة. يحتوي على Apixaban جديد حتى Day 3، Clopidogrel مطلوب إيقافه، تغيير Insulin glargine، وأدوية إضافية، وفحص Kidney function في Day 5، وحجز Cardiology في Day 3 وحضور في Day 10 ومتابعة جرح.
2. عرض `Care graph` بداية Apixaban في Day 1، واستمراره في Day 3 بمالك Patient وخطر High وبسهم Question order من البدء، وغياب متابعة Day 7. ارتباط الحجز بالحضور ظهر كـ Context.
3. جمعت جلسة واحدة أربع مهام وسؤالاً مفتوحاً. جاء سؤال الجرعة المرتفع، ثم بدء Apixaban، ثم الاستمرار في دواء مطلوب إيقافه، ثم مهمة Bisoprolol. سُجلت العروض بالترتيب في `CHECKIN_PRESENTED`. ترك المختبر والزيارة حسب تواريخ الأهلية.
4. أدخل الاختبار «لا، مو على الجرعة الجديدة» → `NOT_DONE`، و«إيه بديت فيه» → `DONE` لـApixaban، ثم زر «لا، للحين آخذه» → `STILL_TAKING` لـClopidogrel، وزر «مو متأكد» → `UNSURE` لـBisoprolol. سُجل النص بعد تأكيد echo. عُرض `OPEN_MEDS` وغادر الاختبار قبل تقديم إجابة.
5. ظهر `STOPPED_STILL_TAKEN` مع `Now` وشرح القاعدة والدليل، وظهر `TASK_NOT_COMPLETED` و`LOW_CONFIDENCE`. لم ينتج `WRONG_DOSE` من نفي الجرعة الجديدة. تشير `GapCard` إلى الأدلة والسبب، ويعرض `Expected vs actual` التحقق حسب المهمة.
6. سجل الاختبار `Log call` ثم `Document intervention` من حساب العرض للطبيب. ظهر `In review` ثم `Awaiting evidence`. ظلت الأدلة دون سجل `STOPPED` بعد التدخل.
7. من `Confirm what happened` سجل الطبيب `Stopped` وملاحظة. أدى الدليل `source: clinician` إلى زوال الشرط وإلى `Verified` للمهمة. أُضيف قرار `EVIDENCE_SUPPORTED` من الواجهة بملاحظة ومرجع الدليل المؤهل.
8. في Global Day 4 عاد المريض فأتيح السؤال المفتوح مرة أخرى. أدخل «للحين آخذ بلافكس» وأكّد echo. ربطت المطابقة Clopidogrel وحدّثت التقييم. أعيد فتح `pt-007:STOPPED_STILL_TAKEN:pt-007/MED_STOP/clopidogrel@d1` في episode جديد، ظهر في queue، ودون ترحيل شارات المراجعة أو التدخل. انتهت أهلية السؤال المفتوح بعد حفظ الإجابة.
9. ظهر تاريخ الكشف والتدخل وإزالة الشرط والإغلاق وإعادة الفتح في Audit. حُفظت الخطة والأدلة والسجل عبر reload. أخفى الرجوع إلى Global Day 3 أحداث Day 4 واستعادها الانتقال إلى Day 4 دون تغيير سجل الأحداث. أُغلق episode الجديد إدارياً للاختبار فظل شرط High قابلاً للاكتشاف وعرضت المهمة `Gap closed`.

جميع الخطوات أعلاه إجراءات UI فعلية نفذها Playwright في Chrome. قرأ السكربت `localStorage` للتأكيد فقط. فحص feed مستقل عن هذا المسار أدخل سجل `LAB_RESULT` اصطناعياً عبر reducer؛ وفحوص الصوت استخدمت mock browser API وFamily Mode في سياقات مستقلة.

## E. التصحيحات وحالات الحافة

| الحالة | ما ظهر على Phase 07 وما تغيّر | الاختبار |
|---|---|---|
| مغادرة `OPEN_MEDS` | كانت أول مشاهدة تمنع الإجابة في بقية اليوم. يميز `questionPlanner.ts` الجواب من العرض، ويجيز عرضاً ثانياً واحداً بعد المغادرة. أي ناتج محفوظ `NONE / REPORTED / UNCERTAIN / UNKNOWN_MEDICINE / DISCARDED` ينهي الأهلية ذلك اليوم | `store.test.ts`، Chrome للمريض الجديد. لم يغيّر حصة خمس مهام أو قائمة الجلسة الثابتة |
| إفادة متجددة مطابقة | إعادة التقييم وحدها ونسخ السجل تبقى مستقرة. حقل `recordedSeq` يربط الدليل الساري غير الغامض بـ`CHECKIN_ANSWER` مستقل بعد التدخل أو الإغلاق الإداري. `gapLifecycle.ts` و`gapEngine.ts` و`state/lifecycle.ts` تجدد المراجعة أو تفتح episode جديداً | اختباران لنفس الادعاء بعد التدخل مع الإغلاق الإداري وبدونه. تكرار ID و`ADD_EVIDENCE` المطابق والتخزين وإعادة العرض اختُبرت. المسار الجديد يختبر التناقض بعد زوال الشرط |
| إغلاق High إدارياً | يبقى الشرط في أرشيف Overview واضحاً مع Risk وسبب ومراجع في Audit. يخرج القرار من المسار النشط ما دام الشرط نفسه مغطّى. `CLOSED` لا يضيف إثباتاً | المسار الجديد و`gapLifecycle.test.ts` |
| الرجوع وتسجيل إجراء جديد | تختفي السجلات المستقبلية من منظور اليوم الأسبق. يبقى الإجراء الجديد والتاريخ اللاحق، وتُطبّق أولوية يوم الوقوع ثم ترتيب التسجيل عند التعادل | `gapLifecycle.test.ts` لحالة rewind مع `STOPPED` جديد، Chrome reload/rewind/forward |
| Legacy feed وlifecycle | اختُبرت استعادة النسخ القديمة ورفض سجل جديد دون `eventKind` الموافق. الإغلاق القديم إداري بحسب اليوم وتطبيقه محافظ على أدلة legacy ذات الصلة. لا ينتج حدث تدخل تاريخي منه | `store.test.ts`، `gapEvidence.test.ts`، `gapLifecycle.test.ts` |
| Targeted Undo | تحقق Chrome من بقاء الساعة والإجراء الآخر ودليل المريض الآخر. يختبر `gapLifecycle.test.ts` الآن بقاء عرض سؤال وجواب وأدلتهما مع كامل السجل السابق، ورفض Undo المكرر أو المتجاوز | جرى توسيع fixture الاختبار القديم من إضافة دليل مباشرة إلى `RECORD_PRESENTATION` ثم `RECORD_ANSWER`، وبقيت توقعات Undo السابقة |
| دقة الواجهة | كانت صفحة Validation تعرض Phase 04 وتستند بعض النصوص إلى ادعاءات عن الاتصال أو أداء غير مقاس. المصدر الصحيح والتسميات الحالية موضحان في القسم G | مقتطفات JSON المولدة، Chrome Validation وجولة العرض. تغيّر النص المتوقع في فحص المتصفح من «بنخلي الممرضة تتأكد منك» إلى «الجواب يحتاج مراجعة داخل العرض التجريبي» للحفاظ على معنى المراجعة المحاكية |

## F. نتائج إعادة الاختبار والبيئة

| الفحص | النتيجة |
|---|---|
| Phase 01، سجل تاريخي مستعاد | 141 اختباراً في 12 ملفاً |
| Phase 07، إعادة تشغيل قبل التعديل | 299 في 16 ملفاً، بناء 543.29 kB، إعادة إنتاج نتائج التحقق الاصطناعي |
| Phase 08، الاختبارات النهائية | 302 في 16 ملفاً، 3 حالات زائدة عن Phase 07 و161 عن Phase 01 |
| TypeScript وVite | بناء ناجح. main JS 544.26 kB، 167.72 kB gzip. تحذير Vite 500 kB قائم، والمسارات الأساسية شُغلت مع البناء الحالي |
| مجموعة الفجوات الأصلية | 67/67، لا فائت ولا غير متوقع، 23/23 إحالة عالية الخطر. صفر Gap في 10 clean controls عبر 150 يوم-مريض |
| مجموعة Phase 06 المركزة | 7/7، لا فائت ولا غير متوقع، 1/1 إحالة عالية الخطر، صفر على clean control واحد |
| Invariants | 5/5. تشمل منع التحقق بالثقة المنخفضة وضبط فصل المصادر |
| Question planning | 1,747 مقابل 8,304 عبر 900 يوم-مريض اصطناعي، 79.0% أقل من baseline افتراضي. في replay منفصل 466/466 و135/135 High، و381 إعادة عرض لمهام، و900 سؤال مفتوح، وصفر تأجيل بسبب السعة في هذه المجموعة |
| Chrome وHashRouter | 46/46 في suite العرض. تحقق تحميل أصول `/wasl-mvp/`، deep link بعد reload، الفونت الاحتياطي عند غياب CSS الخارجي، جولة 8 خطوات واستئنافها، Reset وUndo. لا أخطاء تطبيق أو overflow في الفحوص |
| Browser workflows | `check-integrated.mjs` لمسار الإنتاج. فحوص Phase 07 الإضافية A–F، جدولة D/F والحالات الصوتية A–H ومسار غياب API، منها صلاحية مرفوضة وتعارض البدائل وغياب الثقة وcallback متأخر أو مكرر |

اختُبر Windows مع Node `v24.19.0` وnpm `11.17.0` باستخدام dependency tree المتاح في نسخة العمل المعزولة. يستخدم CI الحالي Node 24 على Ubuntu و`npm install --no-audit --no-fund` ثم الاختبارات والبناء ورفع `dist`. فشل تثبيت `npm install` النظيف هنا بسبب `EACCES` لطلبات npm registry. فشل `npm ci --offline` بـ`EUSAGE` بسبب غياب `@emnapi/core` و`@emnapi/runtime` في الرسم المطلوب من `@napi-rs/wasm-runtime@1.2.6` المرتبط بفرع Rolldown WASI الاختياري. إجراء منفصل مقترح للفريق هو إعادة توليد lockfile الحالي بنفس حدود الاعتماديات في بيئة تسمح بالوصول للسجل، ثم فحص `npm ci` على المنصات المعتمدة. لم يُشغّل CI أو النشر هنا.

فشل مدخل `npm run validate` داخل `tsx` عند `uv_os_get_passwd ENOMEM`. شُغّل الملف نفسه `scripts/validate.ts` باستخدام Native Node وملحق لحل import بامتداد `.ts` في البيئة المعزولة، مع تشغيل Vitest الفرعي وتوليد الملفين بصورة حتمية. أوامر استخدام Chrome موجودة في README. قارئ التخزين في اختبارات المتصفح للرصد فقط.

للبيئة المعزولة يمكن حفظ هذا الملحق محلياً باسم `resolve-ts.mjs` خارج المشروع ثم تشغيل `node --import ../resolve-ts.mjs scripts/validate.ts` من جذر المشروع.

```js
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL)
      const candidate = new URL(url.href + '.ts')
      if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(candidate)) {
        return nextResolve(candidate.href, context)
      }
    }
    return nextResolve(specifier, context)
  },
})
```

## G. تدقيق المقاييس والادعاءات

| النص أو المقياس | الصياغة الحالية |
|---|---|
| Parser | نتائج Phase 03 ثم Phase 04 ثم Phase 04B هي **76/78 → 64/78 → 65/78**، وDifficult **18/20 → 12/20 → 12/20**، واستخراج الدواء **5/9** في الثلاثة. Phase 04B يعرض أيضاً **83.3% / 60% / 55.6%**. المقارنة مكررة على النص الاصطناعي نفسه |
| الاختلافات عن labels | 11 من 13 تحت 0.7، واثنان عند الحد أو فوقه هما `u092` و`u094`. النفي العام يثبت فقط عدم أخذ الجرعة الجديدة، ولذلك يسجل التطبيق `NOT_DONE` ويترك الجرعة الفعلية غير محددة. بقيت labels التاريخية كما هي |
| تخطيط الأسئلة | الصفحة تعرض عدد الخطط، وتقارنها بـhypothetical full script. يُعرض replay على حدة، ولا يُعرض تقدير دقائق توفير الموظفين. عرض السؤال وإجابته أحداث تخزين مختلفة |
| قواعد الفجوات | README يذكر 12 نوعاً. missing lab/booking/attendance تصف السجل المتاح. تداخل فئة دوائية يعني `Possible duplicate therapy`. `Verified` نتيجة دليل مؤهل للمهمة |
| مسار المتابعة | مسارات الإحالة داخل المحاكاة. عُدّل النص العربي الذي يوحي بتواصل ممرضة مؤكد، وتوضّح صفحة Help حفظ سجل الجواب محلياً وإمكانية معالجة الصوت بواسطة خدمة المتصفح |
| الجولة | تقرير Day 2 العائلي seeded. يعرض Step 5 الفجوة عالية الخطر في Day 4، ويمكن تجربة الجواب في Step 4. إنشاء مريض وتجربة حلقة مريض جديد مسار اختبار مستقل |

## H. الملفات

- وظيفياً، `src/domain/questionPlanner.ts` و`src/domain/gapLifecycle.ts` و`src/domain/gapEngine.ts` و`src/state/lifecycle.ts`.
- للاختبار، `tests/state/store.test.ts` و`tests/state/gapLifecycle.test.ts` و`tests/domain/safety.test.ts` (توضيح اسم اختبار المجموعة الأصلية فقط)، و`scripts/check-integrated.mjs` الجديد و`scripts/check-views.mjs`.
- لعرض المعنى، `src/pages/console/Validation.tsx` و`CareGaps.tsx` و`About.tsx`، و`src/pages/patient/Checkin.tsx` و`Today.tsx` و`Help.tsx`، و`src/domain/patientViews.ts` و`tour.ts`.
- للتوليد والحفظ، `scripts/validate.ts` و`validation/results.json` و`validation/RESULTS.md` و`validation/results.phase07.json` الجديد للأرشيف.
- للتوثيق، `README.md` و`CLAUDE.md` و`validation/README.md` وهذه الوثيقة.

## I. القيود والنطاق المؤجل

- `VO-02` يبقى `PARTIAL`. ينقص القاموس بعض الصيغ غير المباشرة وبعض اللهجات، وتذهب بعض صيغ الاستمرار والضمير المتصل والمدة غير الراسية إلى المراجعة.
- **الميكروفون الحقيقي غير مختبَر** في التشغيل المعزول. للتحقق يدوياً، يستخدم عضو من الفريق موافق Chrome وبيانات اصطناعية، ويجرب تفعيل الإذن ثم رفضه. يختبر «إيه بديت فيه»، «لا، مو على الجرعة الجديدة»، «ما آخذ بلافكس»، و«مدري يمكن». يراجع النص والـecho وتصحيح الأسماء، ويعيد المحاولة بعد الإلغاء، ثم يختبر النص والأزرار وFamily Mode. يسجّل نتيجة المسار الوظيفي لكل محاولة.
- يغطي التقييم قواعد اصطناعية ونصوصاً كتبها الفريق. حالة الاختبار الخارجي مستقلة ومعلّقة. لا توجد قياسات حية عن الدقة أو الفاعلية أو النتائج السريرية أو الإشعارات المستلمة.
- توافق legacy يبقي دلالة سجل المصدر والمهمة والتاريخ ضمن سياسة المحافظة. لا تُختلق معلومات `eventKind` أو ملاحظة تدخل أو مرجع إثبات تاريخي مفقود.
- استمرارية البيانات ضمن `localStorage` في المتصفح والأصل الحاليين. البنية خالية من backend ومصادقة إنتاجية وقاعدة بيانات وربط EHR أو مختبر حقيقي.
- Clinical Intelligence & Knowledge Graph مؤجل. HUMAIN Voice وSession Broker وPhase 09A/09B خارج نطاق هذا التسليم.

## J. عقود التسليم إلى UI/UX

**المهام والأدلة.** الأنواع `MED_START`، `MED_CONTINUE`، `MED_DOSE_CHANGE`، `MED_STOP`، `LAB_DONE`، `FOLLOWUP_BOOKED`، `FOLLOWUP_ATTENDED`، `WOUND_CHECK`. الهوية `${patientId}/${type}/${refId}@d${deadlineDay}`. `dependsOn` يصرّح بعلاقة ترتيب للسؤال أو سياق، ويُتحقق من المهمة بدليلها المستقل. الأيام شاملة حتى نهاية العلاج ومواعيد الخطة 0–30، ونافذة المحاكاة تضاف إليها مهلة القواعد.

أبقِ `Evidence.id`، و`reportId`، و`correctsEvidenceId`، و`day` (الوقوع) و`recordedDay` (الإتاحة) و`recordedSeq` (ترتيب التسجيل) و`source` و`eventKind` و`claim` و`rawText` و`confidence` و`voice` و`confirmedByHuman`. استخدم `reconcileMedications` وEvidence Assessment لعرض الفعّال مقابل التاريخ والتصحيح. يعتمد التحقق على `VERIFY_THRESHOLD = 0.7` مع أهلية الادعاء والمصدر والمريض والمهمة وتوقيت الواقعة. `DISPENSED` صرف، `USAGE` استخدام، و`LAB_RESULT` و`APPOINTMENT_BOOKING` و`APPOINTMENT_ATTENDANCE` دلالات منفصلة؛ تقارير المريض والعائلة عن المختبر أو الموعد سياق. echo يؤكد التفسير من صاحب المعلومة، والتأكيد السريري له مصدر وفعل مستقلان. راجع [مصفوفة القواعد الاثنتي عشرة](../validation/phase06-coverage.md) لحالات البدء والإيقاف والجرعة والتداخل والدواء غير المدرج والمختبر والحجز والحضور الصريح وغياب الحضور وعدم الإتمام وغياب الإجابة والغموض.

**الفجوات ودورة حياتها.** الهوية المستقرة `${patientId}:${type}:${entityKey}`. `triggerEvidenceIds` أدلة اشتغال القاعدة و`evidenceIds` تشمل الدليل المساند. تعرض الأولوية المسار ثم الدرجة التي تفسّرها الشدة والخطر والتأخر وعلاوة الغموض. `CLINICIAN_NOW` و`CLINICIAN_24H` و`PATIENT_REMINDER` مسارات عرض. `GAP_DETECTED` و`GAP_REOPENED` يحددان episode جديداً، و`GAP_UPDATED` يحدد revision في episode مفتوح. ربط القرار episode وrevision وبصمة الدليل ومراجعه. `CALLED` و`INTERVENED` و`CONFIRMED` و`RESOLVED` و`UNDONE` ذات أدوار مستقلة. الإغلاق الإداري يحتاج سبباً وملاحظة، والإغلاق المدعوم يحتاج أدلة زوال، ويعكس Undo قراراً محدداً بالـsequence دون إسقاط سجل الإجراءات. `PENDING / VERIFIED / GAP / ESCALATED / CLOSED` حالات تقييم تُعرض مع معنى `CLOSED` الإداري عند وجود الشرط.

**التخزين.** React Context مع `useReducer` و`DemoStoreProvider` في `src/state/store.tsx`. الإصدار `STATE_VERSION=9` والمفتاح `wasl.demo.v9`. `loadState` يفحص v9 ثم يحاول v8 إلى v4 ضمن سياسة البيانات المتوافقة. `patientToday = globalDay - dischargeDay`. يفلتر العرض ما قبل الخروج وما بعد منظور اليوم عند rewind. يحفظ `audit` العرض والجواب وإتمام الجلسة والكشف والمراجعة والقرارات، وترتيب الأحداث يعتمد المواقع المحفوظة. `reset` يُعيد البذرة في Day 4، و`replace` لاسترجاع حالة صالحة في مسار Reset، و`undoResolution` مستهدف. `OPEN_MEDS` مرتبط بالمريض، والأسئلة الأخرى مثبتة لـtaskId. المجموعة تُلتقط عند بدء الجلسة وتحتفظ بحصة خمس مهام وسؤال مفتوح مؤهل.

| المسار والواجهة | البيانات والمحددات | الإجراءات، الحالات، والعقد الذي يجب الحفاظ عليه |
|---|---|---|
| `/#/` · RoleLauncher والجولة | `tour` وseed و`tourDay`، `TOUR_STEPS` | بدء، تنقل واستئناف وعودة لدور المريض أو الطبيب. Day 2 تقرير seeded في القصة، وDay 4 طابور الفجوات |
| `#/clinician` · CareGaps | `evaluation.gaps`، `clinicianGaps`، `escalationsNow`، `patientReminders`، `questionPlans` | فرز ومرشحات وروابط الحالة. High/Medium/Low والمسارات والمراجعة والإحالة المحاكية |
| `#/clinician/patients` · Patients | `state.patients`، `tasksByPatient`، `evaluation`، `verificationSummary` | بحث وفتح السجل أو New Discharge. الحالات المفتوحة والمؤشرات تعتمد على يوم المريض والدليل |
| `#/clinician/new` · NewDischarge | `planForm` و`DrugPicker` و`buildCareGraph` للمعاينة | `addPatient`، عينة أو إدخال، ربط المختبر، منع المكررات، أخطاء الحقول، حد العلاج، خطة جديدة في Global Day الحالي |
| `#/clinician/patient/:id` · Overview و`?gap=` | `usePatient`، `tasksFor`، `patientToday`، `Evaluation.conditions/gaps/lifecycle` | عرض Open/Review/Awaiting/Reopened/administrative archived/evidence-supported. `resolveGap` و`confirmTask` و`reviewMedicationReport` و`undoResolution` حسب أهلية الدليل |
| `?tab=care-graph` · CareGraphTab | `CareTask[]` و`layoutCareGraph` وحالة التقييم والسجلات | Fit/Scroll، Drawer، المالك والخطر والموعد، Question order أو Context، أصل الدليل وحالة التحقق |
| `?tab=expected` · ExpectedActualTab | الخطة و‎`EvidenceAssessment` والأدلة الدوائية الفعّالة والتاريخية، `taskStatus` | عرض الادعاء والواقعة والمصدر والثقة، والفرق بين Pending وVerified وGap closed وunresolved report |
| `?tab=audit` · AuditTab | `patientAuditTrail` و`AuditEntry` والملاحظات ومراجع الدليل | تصفية النوع، عرض الكشف والمراجعة والتدخل والإغلاق والإعادة وUndo، مع ضبط اليوم |
| `#/validation` و`#/about` | نتائج JSON ومقارنة Phase 04B، ونصوص توضيحية | تفسير مجموعات البيانات الاصطناعية وإعادة العرض، وفصل القياس التاريخي وفرضيات التخطيط من استخدام التطبيق |
| `#/patient/:id` · Today | `usePatient`، `useQuestionPlan`، `useCheckinToday` | بدء check-in؛ حالات قبل الخروج، أسئلة متاحة، لا أسئلة أو جلسة منجزة؛ Patient/Family |
| `#/patient/:id/checkin` · Checkin | `QuestionPlan`، `checkinReducer`، `useSpeechRecognition`، `evidenceForAnswer` | `recordPresentation`، `recordAnswer`، `completeCheckin`. intro/question/listening/understanding/echo/saved/done، fallback، تصحيح الأسماء، attribution للمريض أو العائلة |
| `#/patient/:id/meds` · Meds | الخطة مصنفة بالفعل الدوائي و`medStatusFor` | عرض مؤكد أو قيد المتابعة وحالة ما قبل الخروج. الإغلاق الإداري لا يؤكد تناول الدواء |
| `#/patient/:id/appointments` · Appointments | `appointmentItems` والتقييم ومواعيد المريض | pending/missing/done، مع فصل وجود نتيجة مختبر أو تأكيد حجز أو حضور |
| `#/patient/:id/help` · Help | نسخة العرض ورسالة مخزّن المتصفح | زر توضيحي محلي، وحالة المراجعة داخل العرض. |

المكوّنات المشتركة في `src/components/ui` تشمل `Button` و`Card` و`Badge` و`Field` و`Tabs` و`Drawer` و`Toast` و`EmptyState` و`InfoTip` و`SegmentedControl`. حافظ على Navigation الحالية ومفاتيح الوصول وتسمية الحالات ودعم RTL / LTR. واجهة الساعة تستخدم `setDay` ومحددات `buildAllTasks` و`simulationHorizon`، وباقي المحددات المركزية `evaluateAll` و`planAll` في `src/state/selectors.ts`.

**قائمة عدم الانحدار.** شغّل الاختبارات والبناء ومجموعتي التحقق وفحص Chrome بعد تعديل واجهة. أعد مسار المريض الجديد، وراقب الصوت والنص والأزرار والـecho والـchips وFamily Mode. افحص حدود العلاج والساعة وعودة السؤال المتروك وحصة الجلسة، ثم Expected vs actual والأولوية وشرح الدليل والمراجعة والتدخل وإعادة التحقق والإغلاق بنوعيه وإعادة الفتح والتاريخ وUndo. أعد الجولة الثمانية وReset والروابط المباشرة على نسخة الإنتاج. الفحص اليدوي للميكروفون من القسم I مستقل.

**مدخلات مؤجلة.** قد تُستخدم الهوية المستقرة للمهام وعلاقاتها وتحديد المصدر والزمن، ونتائج assessment وتاريخ التدخلات لتصميم Clinical Intelligence & Knowledge Graph في مرحلة معتمدة لاحقاً. التنفيذ الحالي يوفر سجلات الإدخال والمخرجات الوصفية للمحركات الستة فقط.

## K. بصمة التجميد

**مراجعة الإكمال.** اكتملت مصفوفة النتائج الـ24 ومراجعة المحركات الستة، مسار المريض المتصل، أهلية الأدلة والقواعد الـ12، الجدولة، دورة الحياة وUndo، حالات الحافة، نصوص العرض وتاريخ التحقق، بناء الإنتاج وفحص Chrome، الجولة، وتوثيق تسليم العقود. التنفيذ الصوتي اللغوي `PARTIAL`، وتقييم ASR الحي والاختبار الخارجي معلّقان. منع خطأ lockfile وتقييد registry إتمام تجربة تثبيت نظيف في البيئة الحالية، واكتملت إعادة الاختبارات من شجرة الاعتماديات المتاحة.

- المجلدان `src/domain` و`src/state`، 30 ملفاً. بصمة SHA-256 للـmanifest هي `26ad8fb22fc43288a9e306af1f1b7a3920f7af9aa9713a60fa4e9aeb07e24d42`. لإعادة الحساب رتّب المسارات النسبية ترتيباً ordinal مع `/`، واكتب كل مسار ثم tab وبصمة ملف lowercase، واختم كل سطر بـLF. احسب SHA-256 لبايتات UTF-8 دون BOM.
- `arabicParser.ts` يطابق بصمة Phase 04B ‏`bb3eb87da18b3a85cf8a34c68ceee23a1c32d51811dd1b8b2312af035023b375`. تطابقت البيانات المجمّدة والآثار التاريخية مع snapshot وأُرشف تقرير Phase 07 حرفياً.
- `STATE_VERSION=9`، والقرار **READY FOR UI/UX** بحدود القسم I وبانتظار الاعتماد الصريح قبل بدء أي مرحلة لاحقة.
