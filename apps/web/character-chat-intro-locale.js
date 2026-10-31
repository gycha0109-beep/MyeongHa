// Fixed, product-authored character introductions. Not stored chat messages.
export const CHARACTER_CHAT_INTROS_V1 = Object.freeze({
  baekheon: Object.freeze({
    'ko-KR': ['이야기를 시작하죠.', '지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?'],
    'ja-JP': ['話を始めましょう。', 'まず何からお話ししたいですか？'],
    'zh-TW': ['我們開始聊吧。', '你現在最想先談的是什麼？'],
    'en-US': ["Let's begin.", 'What would you like to talk about first?'],
    'zh-CN': ['我们开始聊吧。', '你现在最想先谈的是什么？'],
  }),
  seyeon: Object.freeze({
    'ko-KR': ['왔네요.', '오늘은 어떤 이야기부터 해볼까요?'],
    'ja-JP': ['来てくれたんですね。', '今日はどんなお話から始めましょうか？'],
    'zh-TW': ['你來啦。', '今天想先聊些什麼呢？'],
    'en-US': ["You're here.", 'What would you like to talk about today?'],
    'zh-CN': ['你来啦。', '今天想先聊些什么呢？'],
  }),
  yeoul: Object.freeze({
    'ko-KR': ['그래서, 무슨 얘기인데요?', '듣고는 있을게요.'],
    'ja-JP': ['それで、何の話ですか？', '一応、聞きますよ。'],
    'zh-TW': ['所以，到底是什麼事？', '我會聽的。'],
    'en-US': ['So, what is it?', "I'm listening."],
    'zh-CN': ['所以，到底是什么事？', '我会听的。'],
  }),
  seorin: Object.freeze({
    'ko-KR': ['천천히 말씀해 주세요.', '지금부터 함께 볼게요.'],
    'ja-JP': ['ゆっくりお話しください。', '一緒に見ていきましょう。'],
    'zh-TW': ['慢慢說就好。', '我們一起看看吧。'],
    'en-US': ['Take your time.', "We'll look at it together."],
    'zh-CN': ['慢慢说就好。', '我们一起看看吧。'],
  }),
  rahyeon: Object.freeze({
    'ko-KR': ['말해봐요.', '어디서부터 시작할지는 당신이 정해요.'],
    'ja-JP': ['話してみて。', 'どこから始めるかはあなたが決めて。'],
    'zh-TW': ['說說看。', '要從哪裡開始，由你決定。'],
    'en-US': ['Go ahead.', 'You decide where to begin.'],
    'zh-CN': ['说说看。', '要从哪里开始，由你决定。'],
  }),
  mira: Object.freeze({
    'ko-KR': ['편하게 말해요.', '듣고 있을게요.'],
    'ja-JP': ['気楽に話して。', '聞いているから。'],
    'zh-TW': ['放輕鬆說吧。', '我在聽。'],
    'en-US': ['Speak freely.', "I'm here to listen."],
    'zh-CN': ['放轻松说吧。', '我在听。'],
  }),
  taegyeom: Object.freeze({
    'ko-KR': ['핵심부터 말해보죠.', '무엇이 가장 걸립니까?'],
    'ja-JP': ['要点から話しましょう。', '何が一番引っかかっていますか？'],
    'zh-TW': ['直接說重點吧。', '你最在意的是什麼？'],
    'en-US': ["Let's get to the point.", "What's bothering you most?"],
    'zh-CN': ['直接说重点吧。', '你最在意的是什么？'],
  }),
  yunho: Object.freeze({
    'ko-KR': ['천천히 말씀하셔도 됩니다.', '어떤 이야기부터 시작할까요?'],
    'ja-JP': ['ゆっくりお話しいただいて大丈夫です。', 'どのお話から始めましょうか？'],
    'zh-TW': ['慢慢說也沒關係。', '想從哪件事開始聊呢？'],
    'en-US': ['Take all the time you need.', 'Where would you like to begin?'],
    'zh-CN': ['慢慢说也没关系。', '想从哪件事开始聊呢？'],
  }),
  doyun: Object.freeze({
    'ko-KR': ['자, 무슨 얘기부터 해볼까요?', '편하게 말해요.'],
    'ja-JP': ['さて、何から話しましょうか？', '気楽にどうぞ。'],
    'zh-TW': ['來吧，先聊什麼？', '隨意說就好。'],
    'en-US': ['So, what shall we talk about first?', 'Make yourself comfortable.'],
    'zh-CN': ['来吧，先聊什么？', '随意说就好。'],
  }),
});
export function resolveCharacterChatIntroV1(characterKey, requestedLocale) {
  const source = CHARACTER_CHAT_INTROS_V1[characterKey];
  if (!source) return null;
  const locale = Object.hasOwn(source, requestedLocale) ? requestedLocale : 'ko-KR';
  return source[locale];
}
