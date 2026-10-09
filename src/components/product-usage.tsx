"use client";

import { useState } from "react";

import { CampusDialog } from "@/modules/campus/admin/campus-dialog";

export const productUsage = "记录和查看扫楼数据，提高扫楼效率。";

export function ProductUsage() {
  const [isOpen, setIsOpen] = useState(false);

  return <>
    <button className="usage-guide-trigger quiet-button" onClick={() => setIsOpen(true)} type="button">使用说明</button>
    {isOpen ? <CampusDialog onClose={() => setIsOpen(false)} title="使用说明" wide>
      <div className="usage-guide">
        <p className="usage-guide-intro">{productUsage} 扫完一个宿舍后，可便捷记录其大致情况。</p>

        <section className="usage-guide-section" aria-labelledby="guide-flow">
          <div>
            <p className="guide-kicker">快速上手</p>
            <h3 id="guide-flow">一次扫楼，四步完成</h3>
            <ol className="usage-guide-steps">
              <li>选择学校、楼栋和当前楼层。</li>
              <li>点开已扫的宿舍，填写状态和简要备注。</li>
              <li>需要一次记录多间时，进入“批量标记”。</li>
              <li>完成后回到楼层页，核对状态是否更新。</li>
            </ol>
          </div>
          <figure className="usage-visual">
            <svg aria-hidden="true" viewBox="0 0 240 132">
              <rect fill="#f7f9fb" height="132" rx="14" width="240" />
              <rect fill="#172238" height="22" rx="7" width="45" x="15" y="14" />
              <text fill="#ffffff" fontSize="11" fontWeight="700" x="25" y="29">1楼</text>
              <rect fill="#e9eef5" height="22" rx="7" width="45" x="67" y="14" />
              <text fill="#172238" fontSize="11" fontWeight="700" x="77" y="29">2楼</text>
              <rect fill="#fff4ce" height="57" rx="10" width="58" x="15" y="50" />
              <text fill="#996800" fontSize="15" fontWeight="800" x="26" y="76">101</text>
              <text fill="#996800" fontSize="10" fontWeight="700" x="26" y="96">待补扫</text>
              <rect fill="#e2f6eb" height="57" rx="10" width="58" x="91" y="50" />
              <text fill="#087a57" fontSize="15" fontWeight="800" x="102" y="76">102</text>
              <text fill="#087a57" fontSize="10" fontWeight="700" x="102" y="96">已覆盖</text>
              <path d="M175 50h43M197 42l8 8-8 8M197 82h-43M175 74l-8 8 8 8" fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              <text fill="#2563eb" fontSize="10" fontWeight="700" x="164" y="115">选择并记录</text>
            </svg>
            <figcaption>从楼层开始，逐间完成记录。</figcaption>
          </figure>
        </section>

        <section className="usage-guide-section" aria-labelledby="guide-status">
          <div>
            <p className="guide-kicker">看懂颜色</p>
            <h3 id="guide-status">宿舍状态说明</h3>
            <div className="usage-statuses">
              <p><span className="status-dot status-unvisited" />未扫：尚未记录本次扫楼情况。</p>
              <p><span className="status-dot status-pending" />待补扫：已记录，但还需要后续处理或补充。</p>
              <p><span className="status-dot status-covered" />已覆盖：已完成本次需要的记录。</p>
              <p><span className="status-star">★</span>星标：这是你自己录入过的宿舍。</p>
            </div>
          </div>
          <figure className="usage-visual usage-status-visual">
            <svg aria-hidden="true" viewBox="0 0 240 132">
              <rect fill="#eef2f7" height="132" rx="14" width="240" />
              <g fontFamily="system-ui" fontWeight="800" textAnchor="middle">
                <rect fill="#e9eef5" height="72" rx="12" width="58" x="15" y="26" />
                <text fill="#172238" fontSize="15" x="44" y="56">103</text>
                <text fill="#172238" fontSize="10" x="44" y="78">未扫</text>
                <rect fill="#fff4ce" height="72" rx="12" width="58" x="91" y="26" />
                <text fill="#996800" fontSize="15" x="120" y="56">104</text>
                <text fill="#996800" fontSize="10" x="120" y="78">待补扫</text>
                <rect fill="#e2f6eb" height="72" rx="12" width="58" x="167" y="26" />
                <text fill="#087a57" fontSize="15" x="196" y="56">105</text>
                <text fill="#087a57" fontSize="10" x="196" y="78">已覆盖</text>
              </g>
              <text fill="#2563eb" fontSize="18" fontWeight="800" x="211" y="43">★</text>
            </svg>
            <figcaption>颜色反映当前进度，星标表示你的记录。</figcaption>
          </figure>
        </section>

        <section className="usage-guide-section" aria-labelledby="guide-rules">
          <div>
            <p className="guide-kicker">避免遗漏</p>
            <h3 id="guide-rules">操作细则</h3>
            <ul className="usage-guide-rules">
              <li className="guide-rule-key">已经完成大部分注册并且已经留下种子联络人，选择“已覆盖”；没有完成大部分注册或者没有留下种子联络人，选择“待补扫”。</li>
              <li>备注写明关键情况，方便后续复查和交接。</li>
              <li>批量标记仅作用于当前选中的楼层和宿舍，请提交前再次核对。</li>
              <li>打开带星标的宿舍，可查看或更新你自己的记录。</li>
            </ul>
          </div>
          <figure className="usage-visual">
            <svg aria-hidden="true" viewBox="0 0 240 132">
              <rect fill="#f7f9fb" height="132" rx="14" width="240" />
              <rect fill="#ffffff" height="98" rx="12" stroke="#d9e1ec" width="188" x="26" y="17" />
              <text fill="#172238" fontSize="13" fontWeight="800" x="42" y="43">101 · 记录宿舍</text>
              <rect fill="#fff4ce" height="17" rx="6" width="52" x="42" y="55" />
              <text fill="#996800" fontSize="9" fontWeight="800" x="49" y="67">待补扫</text>
              <line stroke="#d9e1ec" strokeWidth="5" x1="42" x2="190" y1="84" y2="84" />
              <rect fill="#087a57" height="18" rx="6" width="52" x="138" y="91" />
              <text fill="#ffffff" fontSize="9" fontWeight="800" x="151" y="104">保存</text>
            </svg>
            <figcaption>选对状态、写清备注，再保存。</figcaption>
          </figure>
        </section>
      </div>
    </CampusDialog> : null}
  </>;
}
