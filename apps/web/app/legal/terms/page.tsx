import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import "@/app/landing.css";

export const metadata: Metadata = { title: "用户协议 · 集智" };

export default function Page() {
  return (
    <LegalPage
      title="用户协议"
      intro="本协议说明使用集智审查意见答复工作台的基本规则。当前为试用阶段，条款会随功能完善而更新。"
      sections={[
        {
          heading: "一、服务内容",
          body: "集智提供中国发明专利审查意见答复的辅助工具：案件材料管理、审查意见分析、答复思路推演与意见陈述书工作稿生成。系统不代理提交官方文件，也不对审查结果作出承诺。"
        },
        {
          heading: "二、账户与使用",
          body: "账户仅限本人或所属机构内部使用。请妥善保管密码；由账户产生的操作视为账户持有人的操作。发现异常请及时修改密码。"
        },
        {
          heading: "三、生成结果",
          body: "系统输出的是供专业人员复核的工作稿（可编辑 DOCX）。使用者应在提交前逐段核对事实、法律依据与权利要求文本，并自行承担定稿责任。"
        },
        {
          heading: "四、禁止行为",
          body: "不得上传无权处理的案件材料；不得将服务用于违法用途或转售、批量爬取；不得尝试破坏服务的安全与稳定性。"
        },
        {
          heading: "五、服务变更与终止",
          body: "当前为试用阶段，功能与价格可能调整。若停止提供服务，会提前在站内说明，并保留必要期限以便导出既有案件文件。"
        }
      ]}
    />
  );
}
