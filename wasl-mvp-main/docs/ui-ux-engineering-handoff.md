# WASL · تسليم العقود الهندسية إلى UI/UX

هذه خريطة التنفيذ الحالي قبل بدء التصميم. المسارات كلها تحت `/wasl-mvp/#` بواسطة `HashRouter`. يركّب `App.tsx` موفّر `DemoStoreProvider` المشترك و`TourPanel`. يستخدم الفريق `ConsoleShell.tsx` بالإنجليزية LTR، ويستخدم المريض `PatientShell.tsx` بالعربية RTL. تحفظ React Context و`useReducer` الحالة محلياً ضمن `wasl.demo.v9`. تُشتق معظم الشاشات تزامنياً من المخزن وملفات التحقق. حالات الانتظار الشبكي في الواجهة تخص الصوت؛ لا تعتمد قائمة الرعاية أو عارض الرسوم على طلب backend.

## A. المسارات والإطارات

| المسار بعد # | الإطار | المعاملات والتنقل |
|---|---|---|
| `/` | `src/pages/RoleLauncher.tsx` | نقطة اختيار الدور أو Start guided demo. |
| `/clinician`، `/clinician/patients`، `/clinician/new` | `src/components/console/ConsoleShell.tsx` | الطابور، المرضى، إنشاء الخطة. يملأ `/clinician/new?sample=1` النموذج الاصطناعي. |
| `/clinician/patient/:id` | ConsoleShell | يقرأ `tab=overview` أو `care-graph` أو `expected` أو `audit`، و`gap=<id>` لإبراز فجوة. |
| `/validation`، `/about` | ConsoleShell | تقرير المحاكاة ووصف المنتج. |
| `/patient/:id` و`/meds` و`/appointments` و`/help` | `src/components/patient/PatientShell.tsx` | Today وشرائط المريض. يشير `:id` إلى المريض الاصطناعي. |
| `/patient/:id/checkin` | PatientShell | التشييك المعتاد. يعرض `?voice=humain` وضع المحادثة إذا كانت الميزة مفعّلة على loopback. يخفي `PatientShell` شريط التبويبات خلال التشييك ويتيح على سطح المكتب الانتقال لسجل الطبيب أو لتبديل المريض. |
| مسار مجهول أو مريض غائب | `src/pages/NotFound.tsx` أو حالة فارغة محلية | يعرض رسالة مع رابط رجوع. |

توجد المعرفات ومساعدات الروابط في `src/routes.ts`. يستمد `DayStepper.tsx` حد الساعة من `simulationHorizon` ويحركها بواسطة `setDay`. اليوم النسبي للمريض يأتي من `patientToday`. يحتفظ `Sidebar.tsx` بإجراء Reset Demo وإتاحة Undo لهذا الإجراء، ويبدأ Reset عند Day 4. تتكون الجولة من ثماني خطوات في `src/domain/tour.ts`، و`TourPanel.tsx` يقود التنقل وإبراز `data-tour`. تُهيأ الجولة عند Day 2 وتعرض الطابور عند Day 4. لا تستبدل روابط الجولة أو علامات الإبراز دون تشغيل الجولات بعد التعديل.

## B. شاشة المريض وعقودها

| الشاشة | الملف والاعتماد | الأفعال والحالات التي تُحفظ |
|---|---|---|
| Today | `src/pages/patient/Today.tsx`، `useQuestionPlan` و`useCheckinToday` | يعرض الأسئلة المتبقية والتقدم، التشييك المعتاد والمحادثة الاختيارية. يميّز لا خطة نشطة، لا أسئلة إضافية، وإكمال اليوم مع أسئلة متبقية. |
| أدويتي | `src/pages/patient/Meds.tsx`، `usePatient` و`tasksFor` و`medStatusFor` | عرض أدوية الخطة المتوقعة، والتغيير والجرعة المكتوبة وحالة التحقق. لا توجد كتابة للوصفة. حالة فارغة عند غياب الخطة/الأدوية. |
| المواعيد | `src/pages/patient/Appointments.tsx`، `appointmentItems` والحالات والوقت النسبي | عرض التحاليل والمتابعة من الحالة الحالية. حافظ على حالة لا مواعيد والتمييز بين انتظار التأكيد والسجل المدعوم بالمصدر. |
| Help | `src/pages/patient/Help.tsx` | عرض معلومات المساعدة والرجوع عبر الشريط. |
| التشييك | `src/pages/patient/Checkin.tsx`، `useQuestionPlan` و`checkinReducer` و`useSpeechRecognition` و`evidenceForAnswer` | البداية، السؤال، الاستماع، فهم النص، Echo، الحفظ، الانتهاء. يدعم النص والأزرار وتصحيح شرائح الأدوية (السؤال المفتوح) وإعادة المحاولة. يكتب `recordPresentation` بعد العرض و`recordAnswer` بعد الفعل الموافق و`completeCheckin` عند إنهاء الأسئلة. حافظ على رسالة المريض المجهول، نفاد الأسئلة، وفشل الصوت مع بدائل. |
| محادثة HUMAIN | `src/components/patient/HumainVoice.tsx` داخل Checkin. `src/voice/humain.ts` و`src/voice/hybridCheckin.ts` | الموافقة، البدء والإيقاف والكتم وتشغيل صوت الرد عند حظر التشغيل. يعرض نص SDK عند توفره. الاقتراح وEcho والتصحيح وتخزين الدليل مسؤولية Checkin. رابط «استخدم التشييك المعتاد» يعيد اختيار خطة الأسئلة القائمة. |
| Family Mode | `src/components/patient/familyMode.tsx` و`PatientHeader.tsx` و`patientPhrasing.ts` | صيغة عائلية للمريض المحدد ومصدر أدلة `family`. تبديل الوضع أو المريض يغلق السياق الهجين القديم. لا ترفع صفة المجيب درجة الثقة. |

يبقى المكروفون اختيارياً. زر الإجابة السريعة في التشييك التقليدي فعل واضح من المستخدم؛ الاقتراح الصوتي من HUMAIN يتطلب Echo وإقراراً مرئياً. حافظ على إتاحة التحكم بلوحة المفاتيح، وعلى أسماء الأزرار المعبرة، وعلى اتجاه RTL في عرض النصوص والأشرطة.

## C. شاشة الطبيب وعقودها

| الشاشة | الملف والمنطق الفعلي | الأفعال والحالات التي تُحفظ |
|---|---|---|
| Care gaps | `src/pages/console/CareGaps.tsx`، `evaluation.gaps` و`clinicianGaps` و`patientReminders` و`escalationsNow` | مؤشرات اصطناعية، تصفية وفرز، اختصارات ولوحة خيارات، فتح التفاصيل. يميّز طابوراً فارغاً من مرشح بلا نتائج. حافظ على نطاق الخطر والمسار اللذين حسبهما WASL. |
| Patients | `src/pages/console/Patients.tsx`، خطة المهام و`verificationSummary` و`evaluation.gapsByPatient` | فرز، اختيار مريض أو New Discharge، وفراغ القائمة. التقدم يعرض المهام المؤهلة وحالة الفجوات الحالية. |
| New Discharge | `src/pages/console/NewDischarge.tsx`، `src/domain/planForm.ts` و`planIntegrity.ts` و`DrugPicker.tsx` | بناء خطة اصطناعية، معاينة المهام، تحذيرات الحقول والتحقق، `addPatient` ثم Open patient. احتفظ بمعرف الدواء القانوني، بموعد/نافذة العلاج، وبحدود التخطيط النسبي. |
| Patient Overview | `src/pages/console/PatientDetail.tsx` و`src/components/console/patient/OverviewTab.tsx` و`GapCard.tsx` | يستخدم `usePatient` و`evaluation.byPatient` و`useQuestionPlan`. يدعم فتح دليل الفجوة وسببيتها، in-review وawaiting evidence، وتأكيداً مرتبطاً بالمهمة، وتسجيل التدخل، وإغلاقاً مُدعوماً أو إدارياً، وUndo لقرار بعينه. يعرض الفجوة المؤرشفة بوضوح. |
| Care graph | `src/components/console/patient/CareGraphTab.tsx`، `tasksByPatient` وعلاقات `buildCareGraph` ونتائج `evaluation` | الخط الزمني، التبعيات، المالك، المخاطر، وأداة تفاصيل المهمة. حافظ على semantic ordering `Question order` في تمييز اعتمادات الجدولة عن روابط السياق. |
| Expected vs actual | `src/components/console/patient/ExpectedActualTab.tsx`، `PatientView` وخطة الدواء ونتائج الأدلة | مقارنة المتوقع بما أُبلغ فعلياً ومتخذ القرار. حافظ على Verified مقابل Gap closed وPending ومصدر الدليل. |
| Review and intervention | `GapCard.tsx` و`OverviewTab.tsx` و`src/components/console/evidence.tsx` | `resolveGap` لـCALLED/INTERVENED/RESOLVED، `confirmTask` لإعادة التحقق المؤهلة، `reviewMedicationReport` للتصحيح، `undoResolution` مع معرف الفجوة وتسلسل الإجراء. تحقق من سبب الإغلاق الإداري، الملاحظة، وحفظ الإجراء المؤهل دون تسوية غيره. |
| Audit trail | `src/components/console/patient/AuditTab.tsx` و`src/domain/auditTrail.ts` | تصفية وإظهار مراحل الفجوة والفاعل والوقت. يعرض No entries عندما يغيب السجل. الاحتفاظ بالفرز بعد إرجاع الساعة، وبالفصل بين clinician actions وsystem events. |
| Validation وAbout | `src/pages/console/Validation.tsx` و`About.tsx` | عرض أدلة اختبار اصطناعي وحدود القياس. حافظ على فصل Phase04B المكتوب عن أداء الصوت الحي وعن أي نتيجة طبية. |

## D. واجهة الصوت الفعلية

| الحالة المرئية أو التقنية | المصدر والانتقال المحمي |
|---|---|
| Disabled / fallback | دالة `voiceExperimentEnabled` تتطلب flag وأصل loopback. يعرض رابط البديل صوت المتصفح أو النص أو الأزرار. |
| Idle / permission / connecting | بطاقة `HumainVoice` تبدأ بموافقة وفعل صريح. `startHumainCall` يدير الإذن وطلب الجلسة وSDK، وحالة ready تأتي بعد نشر الميكروفون. |
| Listening / processing / speaking | callbacks من SDK بحالات `listening`، `thinking`، `speaking`. يظهر الكتم فقط في ready. عند `onAudioBlocked` يتاح بدء تشغيل صوت الرد. |
| Current question / transcript | يحدده التشييك، ويسجّل العرض عند عرضه. نص SDK جزئي أو نهائي، ويربط البوابة الجواب النهائي للمستخدم بسؤال العرض الحالي. |
| Awaiting confirmation / correction | `propose_patient_answer` ينتج pending. `PROPOSE_VOICE` يفتح Echo. «إيه صح» أو تصحيح الشرائح أو «لا، أعيد» هي أفعال WASL. |
| Clarification / invalid proposal | `clarification_required` تعرض رسالة التوضيح؛ `invalid_proposal` و`stale_question` و`transcript_pending` حالات عقد الأداة. لا توجد شاشة مستقلة لكل خطأ RPC. |
| Recording / recorded | حالة `saving` تعطّل الإقرار خلال الحفظ. يتطلب `recorded` إيصالاً في التخزين. إذا فشل التحقق يظهر «الحفظ غير مؤكد»، ويعيد العقد `not_saved`. |
| Interrupted / ending / ended | أزرار الإيقاف أثناء الكلام وإنهاء المكالمة. عند النهاية تُغلق الجلسة ويتوقف الميكروفون ويُلغى المقترح المعلق. انتهاء المدة أو قطع الشبكة أو خروج المستخدم يمر بمسار الإنهاء. |
| Unavailable / error | فشل الإذن أو المصادقة أو الرصيد أو الشبكة يظهر تنبيهاً مصفّى. التشييك العادي يبقى مستقلاً. |

## E. حدود إعادة التصميم

- يمكن تغيير ترتيب العناصر والمقاسات والألوان وعرض البيانات والاتجاهات في مكوّنات العرض، مثل `Card.tsx` و`Badge.tsx` و`ProgressRing.tsx`، مع الحفاظ على حالات التحكم والوصول والروابط.
- مكوّنات الربط `Checkin.tsx` و`HumainVoice.tsx` و`GapCard.tsx` و`OverviewTab.tsx` و`NewDischarge.tsx` و`DayStepper.tsx` و`Sidebar.tsx` لها أفعال محمية. أي تغيير في ربط النقر أو التنقل أو ظهور السؤال يحتاج انعطافاً في اختبارات تلك الأفعال.
- تبقى `src/domain/` و`src/state/` و`src/voice/` و`scripts/humain-broker.mjs` عقوداً قيد المراجعة الهندسية عند الحاجة. استهلك `useDemoStore` و`usePatient` و`useCheckinToday` و`useQuestionPlan`، ومخرجات `tasksFor` و`evaluation` و`dayFor` و`simulationHorizon` عوضاً عن استنتاجها من لون أو نص زر.
- لا تنقل القدرة على تحديد الأسئلة أو المصدر أو التأكيد أو التصعيد إلى HUMAIN. لا تخصص معنى الحسابات بناءً على اختيار تصميمي.

## F. أصول التصميم والحالة المؤجلة

توجد tokens المبنية على Tailwind في `src/index.css`، وتعتمد الواجهات على `src/components/ui/` و`src/components/ui/styles.ts`، وتستعمل Inter وIBM Plex Sans Arabic مع خطوط نظام بديلة وتقليل الحركة، وLucide للأيقونات. الصورة العامة المتاحة للمشروع هي `public/favicon.svg`، وتوجد لقطات العرض السابقة في `docs/screenshots/`. احتفظ بوسم DEMO ودلالات RTL وLTR وبالمعاني الدلالية للخطر والتحقق. Clinical Intelligence & Knowledge Graph محرك مؤجل؛ لا توجد بيانات تشغيلية أو analytics مستقلة له.

## G. قائمة عدم الانحدار بعد إعادة التصميم

1. ثبّت الاعتماديات بـ`npm ci` وشغّل `npm test` و`npm run build`، ثم `npm run check:views` مع تطبيق يعمل على عنوان `APP_URL`.
2. أنشئ مريضاً اصطناعياً، افتح الرسم، افحص اليوم النسبي ومعرفات المهام وعلاقة الترتيب وحد العلاج.
3. شغّل Day 2 مع إجابة سلبية، وافحص الأدلة والمخاطر في الطابور. جرّب النص والأزرار وFamily Mode، وفشل الميكروفون أو غياب الوسيط.
4. على dev مُفعّل، شغّل `HYBRID_MOCK=1` مع `scripts/check-integrated.mjs` واختبر عرض السؤال الفعلي، الاقتراح والنص النهائي، الإقرار والتصحيح، منع الحفظ المكرر، إلغاء Pending على الانقطاع والتبديل، وإيصال التخزين. استخدم `scripts/check-humain.mjs` لفشل الإذن والبديل.
5. تحقق من المراجعة والتدخل والتأكيد المؤهل، الإغلاق بنوعيه، reopen في اليوم نفسه، وUndo لإجراء واحد والتاريخ بعد reload وrewind. أعد تشغيل Guided Demo وReset Demo.
6. اترك الحجز أو الحضور أو المصادقة الطبية كما يقررها مصدر الأدلة. افحص أن صفحة Validation لم تعِد تسمية نتائج الاختبار المكتوب أو المحاكى.
