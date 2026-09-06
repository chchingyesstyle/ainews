export function AboutPage() {
  return (
    <section class="about-page section-wrap">
      <header class="page-header">
        <p class="eyebrow">關於</p>
        <h1>AI 新聞．香港</h1>
        <p class="page-header__lede">每日從公開 RSS／Atom 來源擷取全球人工智能消息，以 Cloudflare Workers AI 整理成香港繁體中文摘要。</p>
      </header>
      <div class="about-page__body">
        <h2>更新頻率</h2>
        <p>每日一次，於協調世界時 06:00（香港時間 14:00）自動執行。</p>

        <h2>編輯原則</h2>
        <ul>
          <li>公開內容使用香港繁體中文，語氣保持中立、簡潔、事實為本。</li>
          <li>AI 只根據來源提供的資料整理內容，不會加入未提供的事實、數字、引述、因果關係、預測或評論。</li>
          <li>資料不足時會明確表示限制，不以推測補充內容。</li>
          <li>每篇文章保留原文連結及來源名稱，只摘錄有限度的原文重點，不複製完整原文。</li>
          <li>AI 輸出須通過格式及內容驗證，方可儲存或發佈。</li>
        </ul>
        <p class="ai-disclosure">內容由 AI 整理，原文請以來源為準。</p>
      </div>
    </section>
  );
}
