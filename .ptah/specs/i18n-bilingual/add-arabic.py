"""One-off: adds the Arabic strings listed in notes.md to content/*.json. English is never touched;
each translation asserts the English it translates, so a concurrent edit makes it fail loudly."""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'content')


def load(name):
    with open(os.path.join(ROOT, name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def save(name, data):
    with open(os.path.join(ROOT, name + '.json'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def setar(obj, en_expected, ar):
    assert isinstance(obj, dict), obj
    assert en_expected is None or obj['en'] == en_expected, (obj['en'], en_expected)
    if obj.get('ar') == ar:
        return
    assert 'ar' not in obj, obj
    obj['ar'] = ar


n = load('narration')
L = n['landmarks']
p = L['pineapple']
setar(p['lines'][2], "Lately: two production AI-native platforms, Pro-Estate and Ptah. Agents, MCP and context engineering, mostly.",
      "وآخر حاجة: منصتين ذكاء اصطناعي شغالين فعلًا، برو إستيت وبتاح. أغلبها وكلاء ذكيين وMCP وهندسة سياق.")
setar(p['lines'][3], "Those bubbles are his underwater specialties. Pick one and I'll give you the short tour, no sales pitch.",
      "الفقاعات دي تخصصاته تحت المية. اختار واحدة وأحكيلك عنها باختصار، من غير كلام بياعين.")
H = {h['id']: h['text'] for h in p['hints']}
setar(H['ai-llm-ops'], "LangChain, LangGraph, MCP, RAG. Agents that cooperate, and harnesses that don't mind which model is on shift.",
      "وكلاء بيتعاونوا مع بعض، وأدوات تشغيل مش فارق معاها أنهي نموذج عليه الوردية: LangChain وLangGraph وMCP وRAG.")
setar(H['architecture'], "Hexagonal, Clean Architecture, DDD, multi-tenancy. He draws the boxes first, so the code has somewhere to live.",
      "معمارية سداسية وClean Architecture وDDD وتعدد المستأجرين. بيرسم الصناديق الأول، عشان الكود يلاقي مكان يسكن فيه.")
setar(H['backend'], "NestJS 11 and TypeScript, with Prisma, ZenStack and Bull queues. The plumbing that keeps the reef running.",
      "السباكة اللي مشغّلة الشعاب: NestJS 11 وTypeScript، مع Prisma وZenStack وطوابير Bull.")
setar(H['databases'], "PostgreSQL, MongoDB, Neo4j, Redis, sqlite-vec. A different fish for every current.",
      "لكل تيار سمكة: PostgreSQL وMongoDB وNeo4j وRedis وsqlite-vec.")
setar(H['frontend'], "Angular 21 with signals and SSR, in Nx monorepos. Even the bottom deserves a good-looking interface.",
      "حتى القاع يستاهل واجهة حلوة: Angular 21 بالـ signals والـ SSR، جوّه مستودعات Nx موحّدة.")
setar(H['devops-tooling'], "Docker, Kubernetes, GitHub Actions, Nx. If it isn't in the pipeline, it didn't ship.",
      "اللي مش في خط النشر يبقى ما اتشحنش: Docker وKubernetes وGitHub Actions وNx.")
t = L['tiki']
setar(t['lines'][1], "It starts at Khabeer Group in 2015, then years of freelance work for startups abroad.",
      "البداية كانت في Khabeer Group سنة ٢٠١٥، وبعدها سنين شغل حر لشركات ناشئة برّه.")
setar(t['lines'][2], "Then Prio, as Lead Software Development Engineer: owning architecture, CI/CD and mentoring senior engineers.",
      "بعدها Prio، مهندس برمجيات رائد: شايل المعمارية والـ CI/CD، وبيوجّه مهندسين كبار.")
k = L['krusty-krab']
setar(k['lines'][1], "The names are for fun. Underneath: AI agent and MCP architecture, SaaS platforms, leadership, bilingual delivery.",
      "الأسامي للهزار. لكن تحتها: معمارية وكلاء ذكاء اصطناعي وMCP، ومنصات SaaS، وقيادة فرق، وتسليم بلغتين.")
setar(k['lines'][2], "Prices are in pearls, kelp and sand dollars. Serious orders go through the Complaints Bureau. Don't ask.",
      "الأسعار باللولي والطحالب ودولارات الرمل. الطلبات الجد بتعدّي على مكتب الشكاوى. ما تسألش.")
b = L['bureau']
setar(b['lines'][1], "It goes privately to Abdallah's desk. The Sardine President reads every one, eventually.",
      "كله بيروح على مكتب عبدالله على انفراد. والرئيس السرديني بيقرا كل واحدة، ولو بعد شوية.")
setar(b['lines'][2], "Leave a reply address if you want an answer. The Municipality is efficient, not psychic.",
      "سيب عنوان للرد لو عايز إجابة. البلدية شاطرة، بس مش بتشم على ضهر إيدها.")
save('narration', n)

s = load('site')
bio = s['profile']['bio']
assert bio[0]['en'].startswith('Expert software architect and founder with 12+ years')
setar(bio[0], None,
      "مهندس برمجيات ومؤسس بخبرة تزيد على ١٢ عامًا في تصميم منصات SaaS قابلة للتوسع وأنظمة ذكاء اصطناعي ذكية. "
      "أتخصص في الذكاء الاصطناعي الوكيلي وهندسة السياق وتطبيقات بروتوكول سياق النماذج (MCP)، وأطلقت مؤخرًا "
      "منصتين أصليتين للذكاء الاصطناعي في بيئة الإنتاج — برو إستيت وبتاح — مع قيادة فرق هندسية عبر كامل طبقات البرمجيات.")
setar(bio[1], "Registered resident of Qaa El-Hamour: I settled at the bottom, built a NestJS monorepo there, and kept the sardines as stakeholders.",
      "مقيم رسمي في قاع الهامور: استقرّيت في القاع، وبنيت هناك مستودعًا موحّدًا بـ NestJS، وأبقيت السردين من أصحاب المصلحة.")
missing = [key for key, value in s['copy'].items() if 'ar' not in value]
assert not missing, missing
save('site', s)

r = load('resume')
items = {i['id']: i for i in r['items']}
setar(items['freelance']['company'], 'Freelance / self-employed', 'عمل حر')
for item in r['items']:
    loc = item['location']
    setar(loc, None, {'Remote': 'عن بُعد', 'Egypt': 'مصر', 'Giza, Egypt': 'الجيزة، مصر'}[loc['en']])
setar(items['miramar-staffing']['summary'], "Co-founded the company and lead its technical direction, building the engineering team behind its AI-native SaaS platforms.",
      "شارك في تأسيس الشركة ويقود توجهها التقني، ويبني الفريق الهندسي وراء منصاتها السحابية القائمة على الذكاء الاصطناعي.")
setar(items['prio']['summary'], "Directed the SDLC for key enterprise products, owning architecture and deployment.",
      "أدار دورة حياة تطوير البرمجيات لمنتجات مؤسسية رئيسية، مسؤولًا عن المعمارية والنشر.")
setar(items['freelance']['summary'], "Delivered high-performance web applications and modernised legacy systems for international startups.",
      "قدّم تطبيقات ويب عالية الأداء وحدّث أنظمة قديمة لشركات ناشئة دولية.")
setar(items['khabeer-group']['summary'], "Built data-intensive web applications and real-time tracking automation for enterprise systems.",
      "بنى تطبيقات ويب كثيفة البيانات وأتمتة للتتبع اللحظي لأنظمة مؤسسية.")
setar(items['miramar-staffing']['quip'], "Built the team, then built the robots that argue with the team. Productive chaos.",
      "بنى الفريق، وبعدين بنى الروبوتات اللي بتتخانق مع الفريق. فوضى منتجة.")
setar(items['prio']['quip'], "Left the codebase stricter than it started. The types are grateful.",
      "ساب الكود أصرم مما استلمه. والأنواع شاكرة فضله.")
setar(items['freelance']['quip'], "Remote since before remote was a personality.",
      "شغّال عن بُعد من قبل ما الشغل عن بُعد يبقى موضة.")
setar(items['khabeer-group']['quip'], "Started before signals existed. Survived anyway.",
      "ابتدى قبل ما الـ signals تظهر. وعدّاها برضه.")
save('resume', r)

sv = load('services')
items = {i['id']: i for i in sv['items']}
a = items['agent-mcp-architecture']
setar(a['title'], 'AI agent & MCP architecture', 'معمارية وكلاء الذكاء الاصطناعي وMCP')
setar(a['description'], None, "تصميم وإطلاق أنظمة متعددة الوكلاء، وخوادم بروتوكول سياق النماذج (MCP)، وأدوات تشغيل نماذج لغوية مستقلة عن المزوّد تعمل فعلًا في بيئة الإنتاج.")
setar(a['price'], 'Three pearls and a whitepaper', 'تلات حبات لولي وورقة بيضاء')
a = items['saas-platform-architecture']
setar(a['title'], 'SaaS platform architecture', 'معمارية منصات SaaS')
setar(a['description'], None, "معمارية متكاملة على Nx وNestJS وAngular: خلفيات متعددة المستأجرين، وتحكم في الوصول قائم على السياسات، وواجهات SSR، وحدود وحدات مُلزِمة.")
a = items['technical-leadership']
setar(a['title'], 'Technical leadership & team building', 'القيادة التقنية وبناء الفرق')
setar(a['description'], None, "قيادة الفرق الهندسية، ووضع معايير المعمارية، وإدارة مراجعات الكود، وتوجيه كبار المهندسين حتى يُسلّم الفريق بثبات.")
setar(a['price'], 'A seat at the reef council', 'كرسي في مجلس الشعاب')
a = items['bilingual-product-delivery']
setar(a['title'], 'Arabic-first bilingual product delivery', 'تسليم منتجات ثنائية اللغة بالعربية أولًا')
setar(a['description'], None, "إطلاق منتجات RTL/LTR بنمذجة محتوى ثنائية اللغة حقيقية، من مخطط نظام إدارة المحتوى إلى نصوص الواجهة، دون أن تتأخر لغة عن الأخرى.")
setar(a['price'], 'Two sand dollars and a dictionary', 'اتنين دولار رمل وقاموس')
save('services', sv)

pj = load('projects')
items = {i['id']: i for i in pj['items']}
setar(items['anubis-mcp']['summary'], None,
      "نظام إرشاد مفتوح المصدر متوافق مع MCP، يوجّه وكلاء الذكاء الاصطناعي (Cursor وClaude) لاتباع أنماط معمارية مُلزِمة.")
save('projects', pj)
print('ok')
