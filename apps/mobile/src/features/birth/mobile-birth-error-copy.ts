import { translateMobileUiCopy, type MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * Closed list of author-controlled Birth form errors and validation messages.
 * Unknown strings, API response bodies and personal input are never translated.
 * Translation does not change the canonical validation error messages or rules.
 */
const BIRTH_ERROR_ROWS_V1 = [
  [
    "출생 월을 입력해 주세요.",
    "出生月を入力してください。",
    "請輸入出生月份。",
    "Please enter your birth month.",
    "请输入出生月份。"
  ],
  [
    "출생 일을 입력해 주세요.",
    "出生日を入力してください。",
    "請輸入出生日期。",
    "Please enter your birth day.",
    "请输入出生日期。"
  ],
  [
    "출생 월을 확인해 주세요.",
    "出生月をご確認ください。",
    "請確認出生月份。",
    "Please check your birth month.",
    "请检查出生月份。"
  ],
  [
    "출생 일을 확인해 주세요.",
    "出生日をご確認ください。",
    "請確認出生日期。",
    "Please check your birth day.",
    "请检查出生日期。"
  ],
  [
    "출생 연도는 네 자리로 입력해 주세요.",
    "出生年は4桁で入力してください。",
    "請輸入四位數的出生年份。",
    "Enter your birth year using four digits.",
    "请使用四位数字输入出生年份。"
  ],
  [
    "출생 연도를 확인해 주세요.",
    "出生年をご確認ください。",
    "請確認出生年份。",
    "Please check your birth year.",
    "请检查出生年份。"
  ],
  [
    "존재하는 양력 생년월일을 입력해 주세요.",
    "実在する新暦の生年月日を入力してください。",
    "請輸入有效的國曆出生日期。",
    "Enter a valid solar-calendar birth date.",
    "请输入有效的公历出生日期。"
  ],
  [
    "출생시간은 HH:mm 형식으로 입력해 주세요.",
    "出生時刻は HH:mm 形式で入力してください。",
    "請以 HH:mm 格式輸入出生時間。",
    "Enter your birth time in HH:mm format.",
    "请按 HH:mm 格式输入出生时间。"
  ],
  [
    "출생시간을 확인해 주세요.",
    "出生時刻をご確認ください。",
    "請確認出生時間。",
    "Please check your birth time.",
    "请检查出生时间。"
  ],
  [
    "달력 유형을 확인해 주세요.",
    "暦の種類をご確認ください。",
    "請確認曆法類型。",
    "Please check the calendar type.",
    "请检查历法类型。"
  ],
  [
    "오전 또는 오후를 선택해 주세요.",
    "午前または午後を選択してください。",
    "請選擇上午或下午。",
    "Please select AM or PM.",
    "请选择上午或下午。"
  ],
  [
    "출생시간의 시를 선택해 주세요.",
    "出生時刻の「時」を選択してください。",
    "請選擇出生時間的小時。",
    "Please select the hour of birth.",
    "请选择出生时间的小时。"
  ],
  [
    "출생시간의 분은 00부터 59까지 입력해 주세요.",
    "出生時刻の「分」は00～59で入力してください。",
    "出生時間的分鐘請輸入 00 至 59。",
    "Enter birth minutes between 00 and 59.",
    "出生时间的分钟请输入 00 至 59。"
  ],
  [
    "이미 등록된 출생정보가 있습니다. 현재 내용은 사주 탭에서 확인해 주세요.",
    "出生情報はすでに登録されています。現在の内容は四柱推命タブで確認してください。",
    "出生資料已登錄，請前往八字分頁確認目前內容。",
    "Birth details are already registered. Review them in the Saju tab.",
    "出生信息已登记，请在八字选项卡查看当前内容。"
  ],
  [
    "현재 출생정보를 다시 확인하지 못했습니다. 입력 내용은 그대로 유지됩니다.",
    "現在の出生情報を再確認できませんでした。入力内容はそのまま保持されます。",
    "目前無法重新確認出生資料。已輸入的內容會保持不變。",
    "We could not recheck your birth details. Your entries are preserved.",
    "目前无法重新验证出生信息。已输入的内容将保持不变。"
  ],
  [
    "출생정보를 확인해 주세요.",
    "出生情報をご確認ください。",
    "請確認出生資料。",
    "Please check your birth details.",
    "请检查出生信息。"
  ],
  [
    "입력값을 처리하지 못했습니다. 생년월일과 출생시간을 확인해 주세요.",
    "入力内容を処理できませんでした。生年月日と出生時刻をご確認ください。",
    "無法處理輸入內容。請確認出生日期和時間。",
    "We could not process the input. Check your birth date and time.",
    "无法处理输入内容。请检查出生日期和时间。"
  ],
  [
    "서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.",
    "サーバーに接続できませんでした。ネットワークを確認して再試行してください。",
    "無法連線至伺服器。請檢查網路後重試。",
    "Could not connect to the server. Check your network and try again.",
    "无法连接服务器。请检查网络后重试。"
  ],
  [
    "출생정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    "出生情報を保存できませんでした。しばらくしてからもう一度お試しください。",
    "無法儲存出生資料，請稍後重試。",
    "Could not save birth details. Please try again later.",
    "无法保存出生信息，请稍后重试。"
  ]
] as const;
export const MOBILE_BIRTH_AUTHORED_ERRORS_V1: readonly string[] = Object.freeze(
  BIRTH_ERROR_ROWS_V1.map(([source]) => source),
);

const BIRTH_ERROR_TRANSLATIONS_V1: ReadonlyMap<string, readonly [string, string, string, string]> =
  new Map(BIRTH_ERROR_ROWS_V1.map(([source, ja, zhTw, en, zhCn]) =>
    [source, [ja, zhTw, en, zhCn] as const] as const,
  ));

export function mobileBirthAuthoredErrorCopyV1(source: string, locale: MobileUiLocale): string {
  if (locale === 'ko-KR') return source;
  const row = BIRTH_ERROR_TRANSLATIONS_V1.get(source);
  if (row === undefined) return source;
  // Keep previously reviewed English / Simplified Chinese wording when present.
  if (locale === 'en-US' || locale === 'zh-CN') {
    const reviewed = translateMobileUiCopy(source, locale);
    if (reviewed !== source) return reviewed;
  }
  if (locale === 'ja-JP') return row[0];
  if (locale === 'zh-TW') return row[1];
  return locale === 'en-US' ? row[2] : row[3];
}
