import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import "@/app/landing.css";

export const metadata: Metadata = { title: "隐私政策 · 集智" };

export default function Page() {
  return (
    <LegalPage
      title="隐私政策"
      intro="这一页说明集智如何处理你上传的案件材料与账户信息。内容与系统的实际行为一致。"
      sections={[
        {
          heading: "一、我们收集什么",
          body: "账户信息（邮箱、密码哈希、角色）以及你主动上传的案件材料（审查意见、申请文件、对比文件、历史答复等）、由此产生的分析结果与生成记录。密码以 scrypt 哈希保存，系统不保存明文。"
        },
        {
          heading: "二、数据如何存放",
          body: "案件与材料按账户隔离存放；文件保存在私有对象存储中，通过服务端短时链接读取，不对公网公开。案件被删除后立即禁止访问，并进入清理流程。"
        },
        {
          heading: "三、数据如何使用",
          body: "材料仅用于为你完成本次答复任务：解析材料、分析审查意见、生成答复文稿。系统不会把案件材料用于模型训练，也不向第三方出售或提供。"
        },
        {
          heading: "四、第三方处理",
          body: "生成过程需要调用模型服务与文档解析服务处理你上传的文本，调用范围限于完成本次任务所必需的内容。"
        },
        {
          heading: "五、你的选择",
          body: "你可以随时删除案件与生成记录，也可以在账户页修改密码。需要导出或彻底删除账户数据，请通过联系我们提出。"
        }
      ]}
    />
  );
}
