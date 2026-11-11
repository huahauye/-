/**
 * All marketing copy lives here so the page component stays layout-only, and so
 * prices/quota can be edited in one place (they must match what is actually sold).
 */

export const NAV_LINKS = [
  { id: "product", label: "产品介绍" },
  { id: "flow", label: "功能流程" },
  { id: "pricing", label: "价格方案" },
  { id: "faq", label: "常见问题" },
  { id: "about", label: "关于我们" }
] as const;

export const HERO = {
  eyebrow: "AI 审查意见答复工作台",
  title: ["让专利审查意见答复，", "更高效、更专业。"],
  sub: "面向专利代理师、专利代理机构及企业 IPR 团队的 AI 审查意见答复工作台。",
  text: "从案件材料上传、审查意见智能分析，到答复策略推演和意见陈述书生成，帮助专利专业人员提升答复效率与质量。",
  primary: "免费体验",
  secondary: "观看产品演示",
  note: "生成结果为供专业人员复核的工作稿，系统不会自动提交至官方系统，也不承诺授权结论。"
};

export const KEY_VALUES = [
  {
    no: "01",
    icon: "scan",
    title: "审查意见智能分析",
    text: "自动提取审查意见要点，梳理审查员的审查逻辑。"
  },
  {
    no: "02",
    icon: "route",
    title: "答复策略与逻辑推演",
    text: "结合本申请和对比文件，辅助分析区别特征、创造性及可行的答复方向。"
  },
  {
    no: "03",
    icon: "file",
    title: "意见陈述书生成与导出",
    text: "基于分析结果生成结构化意见陈述书，支持预览和 Word 导出。"
  }
];

export const WORKFLOW_STEPS = [
  {
    no: "01",
    title: "上传案件材料",
    text: "上传本次审查意见通知书、本申请文件、对比文件 D1–Dn，以及必要的历史答复材料。"
  },
  {
    no: "02",
    title: "材料识别与确认",
    text: "自动识别材料类型，整理材料清单，确认当前权利要求版本。"
  },
  {
    no: "03",
    title: "审查意见智能分析",
    text: "分析审查意见，提取审查员认定理由，开展技术特征对比、区别特征分析和创造性论证。"
  },
  {
    no: "04",
    title: "答复策略推演",
    text: "分析可能的答复路径、审查意见中的论证问题和权利要求修改方向。"
  },
  {
    no: "05",
    title: "生成意见陈述书",
    text: "生成意见陈述书正文，支持预览及 Word 下载。"
  }
];

export interface ShowcaseModule {
  id: string;
  no: string;
  title: string;
  lead: string;
  text: string;
  points?: string[];
  image: string;
  alt: string;
}

export const SHOWCASE: ShowcaseModule[] = [
  {
    id: "materials",
    no: "01",
    title: "案件材料智能识别",
    lead: "多份案件材料，一次上传。",
    text: "支持上传审查意见通知书、本申请文件和对比文件，自动识别材料类型，形成结构化材料清单。",
    image: "/landing/materials.png",
    alt: "案件工作区的上传与关键材料界面"
  },
  {
    id: "analysis",
    no: "02",
    title: "审查意见深度分析",
    lead: "深入理解审查员的审查逻辑。",
    text: "自动提取审查意见要点，分析审查员的认定理由，结合申请文件和对比文件梳理关键争议点。",
    points: ["审查意见要点提取", "对比文件技术方案梳理", "技术特征对比", "区别特征识别", "创造性分析"],
    image: "/landing/analysis.png",
    alt: "分析结果页：审查意见争点与逐技术特征对比"
  },
  {
    id: "strategy",
    no: "03",
    title: "答复策略推演",
    lead: "不止于总结审查意见，更关注如何答复。",
    text: "辅助分析审查意见的论证漏洞、技术启示及可行的修改方向，为答复提供分析依据。",
    image: "/landing/strategy.png",
    alt: "分析结果页：答复策略候选与权利要求修改方案"
  },
  {
    id: "statement",
    no: "04",
    title: "意见陈述书智能生成",
    lead: "让分析成果转化为可复核的答复文书。",
    text: "基于审查意见分析和答复策略，生成结构化意见陈述书，支持人工检查、编辑和 Word 导出。",
    image: "/landing/statement.png",
    alt: "生成结果页：意见陈述书已生成及 Word 下载"
  }
];

export const AUDIENCE = [
  { title: "专利代理师", text: "辅助处理 OA 答复案件，减少重复性分析工作。" },
  { title: "专利代理机构", text: "辅助规范审查意见答复流程，提升团队案件处理效率。" },
  { title: "企业 IPR 团队", text: "辅助企业专利工程师分析审查意见，准备答复材料。" }
];

export const ADVANTAGES = [
  { icon: "flag", title: "面向中国专利审查实践", text: "按审查指南的创造性三步法组织分析与成文。" },
  { icon: "layers", title: "多份材料联合分析", text: "本申请、审查意见与 D1–Dn 对比文件在同一案件内联合比对。" },
  { icon: "route", title: "答复逻辑推演", text: "给出可行答复路径与可预见的审查员复驳，便于取舍。" },
  { icon: "user", title: "人工复核与修改", text: "文稿为可编辑 Word 工作稿，代理师可逐段修改后再定稿。" },
  { icon: "file", title: "Word 导出", text: "生成 DOCX 工作稿，同时可下载 PDF 预览版式。" },
  { icon: "history", title: "案件与生成记录", text: "材料版本、分析结果与每次生成记录都可回溯。" }
];

export interface Plan {
  id: string;
  name: string;
  amount: string;
  unit: string;
  quota: string;
  audience: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

/** Prices and quotas: the single place to change what the site advertises. */
export const PLANS: Plan[] = [
  {
    id: "single",
    name: "单次使用",
    amount: "50",
    unit: "元 / 次",
    quota: "一次完整 OA 答复",
    audience: "偶尔需要处理 OA 答复案件的用户。",
    features: ["一次完整 OA 答复任务", "案件材料分析", "答复策略推演", "意见陈述书生成", "Word 文档导出"],
    cta: "立即购买"
  },
  {
    id: "personal",
    name: "个人版",
    amount: "299",
    unit: "元 / 月",
    quota: "8 次 / 月",
    audience: "日常需要处理 OA 答复案件的专利代理师、专利工程师。",
    features: ["每月 8 次 OA 答复", "案件材料智能识别", "审查意见智能分析", "答复策略推演", "意见陈述书生成", "Word 文档预览和下载"],
    cta: "立即购买"
  },
  {
    id: "pro",
    name: "专业版",
    amount: "499",
    unit: "元 / 月",
    quota: "15 次 / 月",
    audience: "OA 答复工作量较大的专利代理师和专利工程师。",
    features: ["每月 15 次 OA 答复", "案件材料智能识别", "审查意见智能分析", "答复策略推演", "意见陈述书生成", "Word 文档预览和下载"],
    cta: "立即购买",
    featured: true
  },
  {
    id: "team",
    name: "团队版",
    amount: "2999",
    unit: "元 / 季度",
    quota: "100 次 / 季度",
    audience: "专利代理机构和企业知识产权团队。",
    features: ["每季度 100 次 OA 答复", "完整 OA 答复功能", "团队使用方案", "团队服务支持（具体内容待确认）"],
    cta: "联系咨询"
  }
];

export const FAQ = [
  {
    q: "集智主要解决什么问题？",
    a: "集智目前只做一件事：中国发明专利审查意见（OA）答复。它把「读审查意见、核对对比文件、推演答复方向、起草意见陈述书」串成一条可追溯的工作流，产出可编辑的 Word 工作稿，供专利代理师复核与修改。"
  },
  {
    q: "使用集智需要上传哪些案件材料？",
    a: "至少需要本次审查意见通知书、本申请文件与当前权利要求；审查意见引用的对比文件 D1–Dn 需要一并上传。如果是第二次或后续审查意见，还应上传历史审查意见与上一轮答复。系统会识别材料类型，识别不准时可在案件页手工纠正。"
  },
  {
    q: "支持上传多个对比文件吗？",
    a: "支持。对比文件按 D1、D2、D3… 标注，可上传多份；分析时会逐技术特征标注各对比文件的公开状态（明确公开、隐含公开、部分公开、未公开、有争议、未核实），不会把审查意见里的转述直接当成已核实的原文。"
  },
  {
    q: "生成的意见陈述书可以修改吗？",
    a: "可以。生成结果是可编辑的 DOCX 工作稿，章节、段落与措辞都能在 Word 里直接修改。系统提供的是初稿与分析依据，最终定稿由代理师完成。"
  },
  {
    q: "可以下载 Word 文件吗？",
    a: "可以。生成完成后可在结果页下载 DOCX，同时提供 PDF 预览以便检查版式。文件通过登录账户同源下载，链接不对外公开。"
  },
  {
    q: "AI 生成的答复是否需要人工审核？",
    a: "需要，而且这是设计前提。系统把材料分析、区别特征与答复思路都摊开给代理师核对，但不会自动提交至官方系统，也不对授权结果作承诺。定稿与提交前必须由专业人员逐段复核。"
  },
  {
    q: "单次使用和套餐如何计费？",
    a: "单次使用 50 元 / 次；个人版 299 元 / 月（含 8 次）；专业版 499 元 / 月（含 15 次）；团队版 2999 元 / 季度（100 次）。当前为试用阶段，在线支付尚未开通，页面上的购买按钮仅作提示，不会产生扣款。"
  },
  {
    q: "套餐使用次数如何计算？",
    a: "一次完整的 OA 答复（从创建一个生成任务到产出文稿）计一次。案件材料上传、材料识别与确认不计次。套餐额度按月或按季度重置，不结转。"
  },
  {
    q: "案件材料如何处理和保护？",
    a: "案件与材料按账户隔离存放，只有所属账户可以访问；文件保存在私有对象存储中，通过服务端短时链接读取，不对公网公开。生成记录可随时回溯。真实客户材料不会用于训练或对外传播。"
  }
];

export const FOOTER = {
  tagline: "面向专利代理师、代理机构与企业 IPR 的 AI 审查意见答复工作台。",
  columns: [
    { title: "产品", links: [{ label: "产品介绍", href: "#product" }, { label: "功能流程", href: "#flow" }] },
    { title: "价格", links: [{ label: "价格方案", href: "#pricing" }] },
    { title: "支持", links: [{ label: "常见问题", href: "#faq" }, { label: "联系我们", href: "#contact" }] },
    {
      title: "条款",
      links: [
        { label: "用户协议", href: "/legal/terms" },
        { label: "隐私政策", href: "/legal/privacy" }
      ]
    }
  ]
};
