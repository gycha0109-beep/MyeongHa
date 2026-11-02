// Authored Records report-hub UI labels only. Do not translate stored Saju source,
// Reader interpretation, Birth data, or any user-created records here.
export const RECORDS_HUB_STATIC_UI_COPY_V1 = new Map([
  ['현재 명식록 차수', {
    'ja-JP': '現在の命式の版', 'zh-TW': '目前命盤版本',
    'en-US': 'Current birth revision', 'zh-CN': '当前命盘版本',
  }],
  ['확인할 수 없음', {
    'ja-JP': '確認できません', 'zh-TW': '無法確認',
    'en-US': 'Unavailable', 'zh-CN': '无法确认',
  }],
  ['이 기록에 제공된 출생정보 차수가 없어 변경 여부는 확인할 수 없습니다.', {
    'ja-JP': 'この記録に出生情報の版がないため、変更の有無を確認できません。',
    'zh-TW': '此紀錄未提供出生資料版本，無法確認是否變更。',
    'en-US': 'This record has no birth revision, so changes cannot be determined.',
    'zh-CN': '此记录未提供出生信息版本，无法确认是否变更。',
  }],
  ['이 보고서의 본문·발행일은 현재 명식록 변경으로 다시 작성되지 않습니다.', {
    'ja-JP': '現在の出生情報が変わっても、レポートの本文と発行日は書き換えられません。',
    'zh-TW': '目前命盤變更不會改寫本報告內容或發行日期。',
    'en-US': 'Changes to your current birth record do not rewrite this report or its issue date.',
    'zh-CN': '当前命盘变更不会改写本报告内容或发行日期。',
  }],
  ['발행 당시 명식과 현재 명식이 같습니다.', {
    'ja-JP': '発行時の命式と現在の命式は同じです。',
    'zh-TW': '發行時與目前的命盤版本相同。',
    'en-US': 'The current birth revision matches the one used for this report.',
    'zh-CN': '发行时与当前的命盘版本相同。',
  }],
  ['현재 명식이 발행 당시와 다릅니다. 이 보고서는 발행 당시 명식을 기준으로 유지됩니다.', {
    'ja-JP': '現在の命式は発行時と異なります。この報告書は発行時の命式に基づいて保持されます。',
    'zh-TW': '目前命盤與發行時不同。本報告仍依發行時的命盤保存。',
    'en-US': 'Your birth revision has changed. This report remains based on the revision at issue.',
    'zh-CN': '当前命盘与发行时不同。本报告仍按发行时的命盘保存。',
  }],
  ['발행 당시 명식과 현재 명식의 변경 여부를 확인할 수 없습니다.', {
    'ja-JP': '発行時の命式と現在の命式が異なるか確認できません。',
    'zh-TW': '無法確認發行時命盤與目前命盤是否不同。',
    'en-US': 'It cannot be determined whether the birth revision has changed since issue.',
    'zh-CN': '无法确认发行时命盘与当前命盘是否不同。',
  }],
  ['새 명식 기준 재생성 준비 중', {
    'ja-JP': '新しい命式での再発行は準備中',
    'zh-TW': '依新命盤重新產生報告的功能準備中',
    'en-US': 'Regeneration for the current birth revision is not yet available',
    'zh-CN': '按新命盘重新生成报告的功能准备中',
  }],
  ['저장된 보고서 다시 불러오기 →', {
    'ja-JP': '保存済みのレポートを再読み込み →',
    'zh-TW': '重新載入已儲存報告 →',
    'en-US': 'Reload saved report →',
    'zh-CN': '重新加载已保存报告 →',
  }],
  ['저장된 보고서의 내용을 확인할 수 없습니다.', {
    'ja-JP': '保存済みのレポートの内容を確認できません。',
    'zh-TW': '無法確認已儲存報告的內容。',
    'en-US': 'The saved report content could not be verified.',
    'zh-CN': '无法验证已保存报告的内容。',
  }],
  ['공식 기록 응답이 검증 기준을 충족하지 않았습니다. 다른 해석으로 대체하지 않습니다.', {
    'ja-JP': '公式記録の応答が検証基準を満たしていません。別の鑑定には置き換えません。',
    'zh-TW': '正式紀錄回應未通過驗證，不會以其他解讀替代。',
    'en-US': 'The official record response failed verification. Another reading will not be substituted.',
    'zh-CN': '正式记录响应未通过验证，不会以其他解读替代。',
  }],
  ['이 공식 보고서의 열람 권한이 없습니다.', {
    'ja-JP': 'この公式レポートを閲覧する権限がありません。',
    'zh-TW': '您沒有權限閱讀這份正式報告。',
    'en-US': 'You do not have access to this official report.',
    'zh-CN': '您没有权限阅读这份正式报告。',
  }],
  ['현재 계정에서 이 저장된 해석에 접근할 수 없습니다. 기록 페이지에서 이용 가능 여부를 다시 확인해 주세요.', {
    'ja-JP': '現在のアカウントではこの保存済み鑑定を閲覧できません。記録ページで利用状況をご確認ください。',
    'zh-TW': '目前帳號無法存取這份已儲存的解讀。請在紀錄頁確認存取狀態。',
    'en-US': 'This account cannot access the saved reading. Check availability from your records.',
    'zh-CN': '当前账号无法访问这份已保存的解读。请在记录页面检查访问状态。',
  }],
  // Shared official-report composition example label on the Saju hub.
  ['공식 보고서 구성 예시. 개인별 해석이 아닙니다.', {
    'ja-JP': '公式レポートの構成例です。個別の鑑定結果ではありません。',
    'zh-TW': '正式報告的內容結構範例，並非個人化解讀。',
    'en-US': 'Example official report structure, not an individual interpretation.',
    'zh-CN': '正式报告结构示例，并非个人解读。',
  }],
  ['완료되어 저장된 사주 풀이를 다시 읽고, 나의 다른 기록도 함께 확인합니다.', {
    'ja-JP': '保存済みの四柱推命の鑑定を読み直し、ほかの自分の記録も確認できます。',
    'zh-TW': '重新閱讀已儲存的八字解讀，也可以查看自己的其他紀錄。',
    'en-US': 'Revisit saved Saju readings and explore your other records.',
    'zh-CN': '重新查看已保存的八字解读，也可浏览您的其他记录。',
  }],
  ['사주 보고서', {
    'ja-JP': '四柱推命レポート', 'zh-TW': '八字報告', 'en-US': 'Saju reports', 'zh-CN': '八字报告',
  }],
  ['다른 기록', {
    'ja-JP': 'その他の記録', 'zh-TW': '其他紀錄', 'en-US': 'Other records', 'zh-CN': '其他记录',
  }],
  ['나의 사주 보고서', {
    'ja-JP': '私の四柱推命レポート', 'zh-TW': '我的八字報告', 'en-US': 'My Saju reports', 'zh-CN': '我的八字报告',
  }],
  ['저장된 결과만 표시하며, 공식 해석과 대리자의 설명은 구분합니다.', {
    'ja-JP': '保存済みの結果のみを表示し、公式鑑定と案内人の説明を区別します。',
    'zh-TW': '僅顯示已儲存的結果，並區分正式解讀與引路人的說明。',
    'en-US': 'Only saved results appear here. Official readings and guide explanations stay separate.',
    'zh-CN': '仅显示已保存的结果，并区分正式解读与引路人的说明。',
  }],
  ['보관된 사주 기록', {
    'ja-JP': '保存済みの鑑定記録', 'zh-TW': '已儲存的八字紀錄', 'en-US': 'Saved Saju readings', 'zh-CN': '已保存的八字记录',
  }],
  ['기록 확인 중…', {
    'ja-JP': '記録を確認中…', 'zh-TW': '正在確認紀錄…', 'en-US': 'Checking records…', 'zh-CN': '正在确认记录…',
  }],

  ['저장된 공식 사주 보고서', {
    'ja-JP': '保存された公式四柱推命レポート', 'zh-TW': '已儲存的正式八字報告',
    'en-US': 'Saved official Saju report', 'zh-CN': '已保存的正式八字报告',
  }],
  ['기록에 저장된 해석을 원래 내용 그대로 한 번에 읽습니다.', {
    'ja-JP': '記録に保存された鑑定を、内容を変えずにまとめて読めます。',
    'zh-TW': '一次閱讀紀錄中儲存的完整原始解讀內容。',
    'en-US': 'Read the original saved interpretation in full, unchanged.',
    'zh-CN': '一次阅读全文中已保存的原始解读内容。',
  }],
  ['발행일', {
    'ja-JP': '発行日', 'zh-TW': '發行日期', 'en-US': 'Issued on', 'zh-CN': '发行日期',
  }],
  ['해석 버전', {
    'ja-JP': '鑑定バージョン', 'zh-TW': '解讀版本', 'en-US': 'Reading version', 'zh-CN': '解读版本',
  }],
  ['보고서 목차', {
    'ja-JP': 'レポート目次', 'zh-TW': '報告目錄', 'en-US': 'Report contents', 'zh-CN': '报告目录',
  }],
  ['해석 영역', {
    'ja-JP': '鑑定分野', 'zh-TW': '解讀領域',
    'en-US': 'Reading domain', 'zh-CN': '解读领域',
  }],
  ['해석의 적용 범위', {
    'ja-JP': '鑑定の適用範囲', 'zh-TW': '解讀適用範圍', 'en-US': 'Reading scope', 'zh-CN': '解读适用范围',
  }],
  ['단계별 읽기', {
    'ja-JP': '段階的に読む', 'zh-TW': '逐步閱讀', 'en-US': 'Step-by-step reading', 'zh-CN': '逐步阅读',
  }],
  ['보고서 전체 보기', {
    'ja-JP': 'レポート全体を見る', 'zh-TW': '查看完整報告', 'en-US': 'Read the full report', 'zh-CN': '查看完整报告',
  }],
  ['사주 보고서 보관함으로 돌아가기', {
    'ja-JP': 'レポート一覧に戻る', 'zh-TW': '返回八字報告列表',
    'en-US': 'Back to Saju reports', 'zh-CN': '返回八字报告列表',
  }],
  ['이 해석의 구조 보기', {
    'ja-JP': 'この鑑定の構造を見る', 'zh-TW': '查看此解讀的結構',
    'en-US': 'View the reading structure', 'zh-CN': '查看此解读的结构',
  }],
  ["상태 확인 불가", {'ja-JP':"状態を確認できません", 'zh-TW':"無法確認狀態", 'en-US':"Status unavailable", 'zh-CN':"无法确认状态"}],
  ["기록된 대리자", {'ja-JP':"記録された案内人", 'zh-TW':"已記錄的引路人", 'en-US':"Recorded guide", 'zh-CN':"已记录的引路人"}],
  ["발행 당시 출생정보 차수", {'ja-JP':"発行時の出生情報バージョン", 'zh-TW':"發行時出生資料版本", 'en-US':"Birth revision at issue", 'zh-CN':"发行时出生信息版本"}],
  ["이 기록에 제공되지 않음", {'ja-JP':"この記録には含まれていません", 'zh-TW':"此紀錄未提供", 'en-US':"Not provided in this record", 'zh-CN':"此记录未提供"}],
  ["원문과 출생정보 기준", {'ja-JP':"原文と出生情報の根拠", 'zh-TW':"原文與出生資料基準", 'en-US':"Source and birth reference", 'zh-CN':"原文与出生信息依据"}],
  ["이 보고서는 발행 당시 저장된 공식 결과입니다. 현재 명식록은 별도로 관리되며, 발행 차수가 없어 변경 여부는 확인할 수 없습니다.", {'ja-JP':"これは発行時に保存された公式結果です。現在の出生情報とは別に管理され、発行時の版がないため変更の有無は確認できません。", 'zh-TW':"本報告為發行時儲存的正式結果。現有命盤分開管理；缺少發行版本，無法確認是否曾變更。", 'en-US':"This report is the original saved result. Current birth details are separate; without the issuance revision, changes cannot be determined.", 'zh-CN':"本报告为发行时保存的正式结果。当前命盘独立管理；缺少发行版本，无法判断是否变更。"}],
  ["기록된 대리자 정보는 과거 참여 이력입니다. 현재 해설 및 대화 접근권을 의미하지 않습니다.", {'ja-JP':"案内人の記録は過去の参加履歴です。現在の説明・会話へのアクセス権ではありません。", 'zh-TW':"引路人紀錄僅屬過往參與歷史，不代表目前的解讀或對話權限。", 'en-US':"The recorded guide is historical provenance, not current access to interpretation or chat.", 'zh-CN':"引路人记录仅属过往参与历史，不代表当前解读或对话权限。"}],
  ["현재 명식록 확인하기 →", {'ja-JP':"現在の出生情報を見る →", 'zh-TW':"查看目前命盤 →", 'en-US':"View current birth details →", 'zh-CN':"查看当前命盘 →"}],
  ["보고서 첫 해석", {'ja-JP':"レポートの最初の鑑定", 'zh-TW':"報告首項解讀", 'en-US':"First report interpretation", 'zh-CN':"报告首项解读"}],
  ["저장된 명식 근거", {'ja-JP':"保存された命式の根拠", 'zh-TW':"已儲存的命盤依據", 'en-US':"Stored chart evidence", 'zh-CN':"已保存的命盘依据"}],
  ["오행 근거", {'ja-JP':"五行の根拠", 'zh-TW':"五行依據", 'en-US':"Five-element evidence", 'zh-CN':"五行依据"}],
  ["십성 근거", {'ja-JP':"通変星の根拠", 'zh-TW':"十神依據", 'en-US':"Ten-god evidence", 'zh-CN':"十神依据"}],
  ["대화 상대 선택 (별도 이용)", {'ja-JP':"会話相手を選択（別サービス）", 'zh-TW':"選擇對話對象（另行使用）", 'en-US':"Choose chat partner (separate access)", 'zh-CN':"选择聊天对象（独立使用）"}],
  ["현세록을 지금 확인할 수 없습니다. 다른 기록은 계속 확인할 수 있습니다.", {'ja-JP':"現在、生活記録を確認できません。ほかの記録は引き続き表示できます。", 'zh-TW':"目前無法查閱現世錄，其他紀錄仍可使用。", 'en-US':"Life records are unavailable now. You can still view your other records.", 'zh-CN':"目前无法查看现世录，其他记录仍可使用。"}],
  ["저장된 사주 보고서를 지금 확인할 수 없습니다.", {'ja-JP':"現在、保存済みの四柱推命レポートを表示できません。", 'zh-TW':"目前無法查看已儲存的八字報告。", 'en-US':"Saved Saju reports are currently unavailable.", 'zh-CN':"目前无法查看已保存的八字报告。"}],
  ["조회가 실패한 상태이며, 기록이 없다는 뜻은 아닙니다. 나중에 다시 확인해 주세요.", {'ja-JP':"取得に失敗しました。記録がないことを意味しません。後ほど再度ご確認ください。", 'zh-TW':"查詢失敗並不代表沒有紀錄，請稍後再試。", 'en-US':"The read failed; this does not mean you have no records. Try again later.", 'zh-CN':"查询失败不代表没有记录，请稍后重试。"}],
  ["저장된 기억을 지금 확인할 수 없습니다. 다른 기록은 계속 확인할 수 있습니다.", {'ja-JP':"現在、保存済みの記憶を確認できません。ほかの記録は引き続き表示できます。", 'zh-TW':"目前無法查看已儲存的記憶，其他紀錄仍可使用。", 'en-US':"Saved memories are unavailable now. You can still view your other records.", 'zh-CN':"目前无法查看已保存的记忆，其他记录仍可使用。"}],
  ["계정 또는 세션이 변경되었습니다. 현재 계정의 기록을 보려면 새로고침해 주세요.", {'ja-JP':"アカウントまたはセッションが変更されました。現在のアカウントの記録を見るには再読み込みしてください。", 'zh-TW':"帳號或工作階段已變更。請重新整理以查看目前帳號的紀錄。", 'en-US':"Your account or session has changed. Reload to view records for the current account.", 'zh-CN':"账号或会话已变更。请刷新页面以查看当前账号的记录。"}],
  ["조회할 수 없음", {'ja-JP':"確認できません", 'zh-TW':"無法查詢", 'en-US':"Unable to load", 'zh-CN':"无法查询"}],
  // Unified Records archive translations across all four UI languages.
  ["MY RECORDS", {
    'ja-JP': "私の記録", 'zh-TW': "我的紀錄",
    'en-US': "MY RECORDS", 'zh-CN': "我的记录",
  }],
  ["아직 저장된 사주 풀이가 없습니다.", {
    'ja-JP': "保存済みの四柱推命の鑑定はまだありません。", 'zh-TW': "尚未儲存八字解讀。",
    'en-US': "No saved Saju readings yet.", 'zh-CN': "还没有已保存的八字解读。",
  }],
  ["완료된 사주 풀이가 저장되면 이곳에서 풀이 이력을 확인할 수 있습니다.", {
    'ja-JP': "完了した鑑定が保存されると、ここで履歴を確認できます。", 'zh-TW': "完成的八字解讀儲存後，即可在這裡查看紀錄。",
    'en-US': "Once a completed Saju reading is saved, you can find it here.", 'zh-CN': "完成的八字解读保存后，即可在这里查看记录。",
  }],
  ["다른 사주 주제 둘러보기", {
    'ja-JP': "ほかの四柱推命テーマを見る", 'zh-TW': "瀏覽其他八字主題",
    'en-US': "Explore other Saju topics", 'zh-CN': "浏览其他八字主题",
  }],
  ["저장된 풀이 열기 →", {
    'ja-JP': "保存済みの鑑定を開く →", 'zh-TW': "開啟已儲存的解讀 →",
    'en-US': "Open saved reading →", 'zh-CN': "打开已保存的解读 →",
  }],
  ["사주 페이지에서 보기 →", {
    'ja-JP': "四柱推命ページで見る →", 'zh-TW': "前往八字頁面查看 →",
    'en-US': "View on Saju page →", 'zh-CN': "前往八字页面查看 →",
  }],
  ["완료", {
    'ja-JP': "完了", 'zh-TW': "已完成",
    'en-US': "Completed", 'zh-CN': "已完成",
  }],
]);
