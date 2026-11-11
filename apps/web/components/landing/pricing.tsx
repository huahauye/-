"use client";
import { useState } from "react";
import { PLANS } from "@/lib/landing-content";

/**
 * Pricing cards. Payment is not wired up and must not pretend to be: every CTA
 * only reveals an explanatory notice, with no request to the server.
 */
export function Pricing() {
  const [notice, setNotice] = useState("");

  return (
    <>
      <div className="lp-pricing">
        {PLANS.map((plan) => (
          <div key={plan.id} className={`lp-plan${plan.featured ? " lp-plan--featured" : ""}`}>
            {plan.featured && <span className="lp-plan__tag">推荐</span>}
            <div className="lp-plan__name">{plan.name}</div>
            <div className="lp-plan__price">
              <span className="lp-plan__amount">{plan.amount}</span>
              <span className="lp-plan__unit">{plan.unit}</span>
            </div>
            <div className="lp-plan__quota">{plan.quota}</div>
            <p className="lp-plan__for">{plan.audience}</p>
            <ul className="lp-plan__list">
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <button
              className={`lp-btn lp-btn--block${plan.featured ? "" : " lp-btn--ghost"}`}
              onClick={() => setNotice(plan.id === "team"
                ? "当前为试用版，团队版的服务内容与开通方式待确认，暂未开通在线购买。"
                : "当前为试用版，暂未开通支付，本按钮不会产生任何扣款。")}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div aria-live="polite">
        {notice && <div className="lp-toast">{notice}</div>}
      </div>
      <p className="lp-pricing__note">
        当前为试用阶段，在线支付尚未开通：价格方案仅作说明，点击购买按钮不会发起任何支付或下单请求。四个套餐的核心答复功能保持一致。
      </p>
    </>
  );
}
