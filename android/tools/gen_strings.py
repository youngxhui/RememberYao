#!/usr/bin/env python3
"""把 `i18n/dictionaries` 的 zh.ts / en.ts 词典转成 Android strings.xml。

- 键路径 `a.b.c` → 资源名 `a_b_c`
- 占位符 `{name}` → 位置参数 `%N$s`（按首次出现顺序编号）
- XML 转义：& < > 与撇号；字面百分号转成 %%

Compose 界面用 stringResource(R.string.xxx)；通知层用 L10n.get(context, "a.b.c")。
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "i18n" / "dictionaries"
OUT_ZH = Path("/Users/yangxiaohui/SideProjects/RememberYao/android/app/src/main/res/values/strings.xml")
OUT_EN = Path("/Users/yangxiaohui/SideProjects/RememberYao/android/app/src/main/res/values-en/strings.xml")


def strip_comments(text: str) -> str:
    # 去掉 // 行注释与 /* */ 块注释（词典里没有 URL，安全）
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def parse_ts_object(path: Path) -> dict:
    text = strip_comments(path.read_text(encoding="utf-8"))
    # en.ts 顶部有 import type 与 type 别名，先摘掉：只保留 export const 起的内容
    marker = re.search(r"^export\s+const\s+\w+\s*=\s*", text, flags=re.M)
    if not marker:
        raise SystemExit(f"找不到 export const：{path}")
    text = text[marker.end():]
    text = text.strip().rstrip(";").strip()
    text = re.sub(r"\s+satisfies[^;]*$", "", text)
    # 相邻字符串字面量拼接："a"\n  "b" → "ab"
    text = re.sub(r'"\s*\n\s*"', "", text)
    # 未加引号的键加引号
    text = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)', r'\1"\2"\3', text)
    # 尾随逗号
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return json.loads(text)


def flatten(node: dict, prefix: str = "") -> dict:
    out = {}
    for key, value in node.items():
        name = f"{prefix}_{key}" if prefix else key
        if isinstance(value, dict):
            out.update(flatten(value, name))
        else:
            out[name] = value
    return out


def to_android_format(value: str) -> str:
    """{name} → %1$s；字面 % → %%。"""
    order = []
    for name in re.findall(r"\{(\w+)\}", value):
        if name not in order:
            order.append(name)

    def replace(match: re.Match) -> str:
        name = match.group(1)
        return f"%{order.index(name) + 1}$s"

    value = re.sub(r"\{(\w+)\}", replace, value)
    # 先保护已经生成的位置参数，再把字面 % 翻倍
    parts = re.split(r"(%\d+\$[sd])", value)
    parts = [p.replace("%", "%%") if not re.fullmatch(r"%\d+\$[sd]", p) else p for p in parts]
    return "".join(parts)


def xml_escape(value: str) -> str:
    value = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # 安卓字符串里未转义的撇号会直接构建失败
    value = value.replace("'", "\\'")
    value = value.replace('"', '\\"')
    return value


def render(entries: dict, extra_keys: dict) -> str:
    # extra 覆盖词典（不是并列追加）：两端同名文案措辞不同 —— 例如 Expo 版的
    # 「添加」在导航栏右上角，Android 用右下角 FAB / 菜单行。直接并列会产出
    # 两条同名 <string>，aapt 报 duplicate resource。
    merged = {**entries, **extra_keys}
    lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"]
    for key in sorted(merged):
        lines.append(f'    <string name="{key}">{xml_escape(to_android_format(merged[key]))}</string>')
    lines.append("</resources>")
    lines.append("")
    return "\n".join(lines)


EXTRA_ZH = {
    # 词典之外、Android 端特有的少量文案
    # 覆盖词典的同名词条放在本区块最前，说明理由
    # 药品库的「添加」是右下角 FAB，不是导航栏右上角（Expo 版是右上角按钮）
    "medication_empty": "药箱还是空的，点右下角添加药品",
    # 家庭成员的「添加」是下方「添加家庭成员」那一行，不在右上角
    "profile_emptyFamily": "还没有家庭成员，点下面的「添加家庭成员」",
    "app_name": "记得吃药",
    "nav_home": "首页",
    "nav_medica": "药品",
    "nav_profile": "我的",
    "nav_back": "返回",
    "action_save": "保存",
    "action_add": "添加",
    "action_search": "搜索",
    "action_close": "关闭",
    "permission_notification_title": "需要通知权限",
    "permission_notification_body": "开启通知后，到点会提醒用药",
    "notification_channelSilent": "用药提醒（静音）",
    "permission_grant": "去开启",
    "permission_denied": "系统通知权限未开启，请到系统设置里允许通知",
    "date_picker_title": "选择日期",
    "time_picker_title": "选择时间",
    "quiet_start": "开始",
    "quiet_end": "结束",
    "empty_reminders": "今天没有待处理的提醒",
    "empty_reminders_hint": "在「我的」里添加用药配置后，这里会按时间排出今天的每一剂",
    "home_reminderActions": "这一剂怎么处理",
    "today_section": "今日待处理",
    "week_overview_title": "本周概览",
    "low_stock_title": "库存速览",
    "no_low_stock": "库存都很充足",
    "family_title": "家庭成员",
    "records_date": "{date}",
    "slot_grid_title": "泡罩格子",
    "twin_add_pack": "补充一板",
    "twin_open_title": "开启数字孪生",
    "plan_medications_empty": "还没有添加药品",
    "person_pick_hint": "请选择用药人",
    "form_name_required": "请填写名称",
    "form_dose_required": "请填写剂量",
    "settings_about_note": "提醒不能替代医嘱，如有疑问请咨询医生或药师。",
    "medication_daysLeftLabel": "剩余天数",
    "medication_noPlans": "还没有用药配置",
    "settings_language_system": "跟随系统",
    "settings_language_zh": "简体中文",
    "settings_language_en": "English",
    "settings_languagePickerTitle": "选择语言",
    "settings_snoozePickerTitle": "选择稍后提醒间隔",
    "records_prevDay": "前一天",
    "records_nextDay": "后一天",
    "records_noAccess": "无法打开分享面板",
    "settings_exportShareTitle": "分享用药报表",
    # M3 Expressive 改版新增：搜索栏 / 拆分按钮 / 消息条 / 首页库存行
    "common_undo": "撤销",
    "common_saved": "已保存",
    "medication_searchHint": "搜索",
    "medication_voiceSearch": "语音搜索",
    "medication_saveAndPlan": "保存并设置提醒",
    "medication_saveAndAddAnother": "保存后再添加一个",
    "home_todaySchedule": "今日安排",
    "home_stockProgress": "{name} 库存 {percent}%",
    "voice_unavailable": "这台设备没有可用的语音输入",
}

EXTRA_EN = {
    # 覆盖词典的同名词条：与 EXTRA_ZH 一一对应，保持两侧键集一致
    "medication_empty": "Your medicine cabinet is empty — tap Add below",
    "profile_emptyFamily": "No family members yet — use Add member below",
    "app_name": "RememberYao",
    "nav_home": "Home",
    "nav_medica": "Medications",
    "nav_profile": "Profile",
    "nav_back": "Back",
    "action_save": "Save",
    "action_add": "Add",
    "action_search": "Search",
    "action_close": "Close",
    "permission_notification_title": "Notifications are off",
    "permission_notification_body": "Turn on notifications to get reminders on time",
    "notification_channelSilent": "Medication reminders (silent)",
    "permission_grant": "Enable",
    "permission_denied": "Notification permission is off. Allow notifications in system settings.",
    "date_picker_title": "Select date",
    "time_picker_title": "Select time",
    "quiet_start": "Start",
    "quiet_end": "End",
    "empty_reminders": "No reminders for today",
    "empty_reminders_hint": "Add a medication plan in Profile to see today's doses here",
    "home_reminderActions": "Handle this dose",
    "today_section": "Today",
    "week_overview_title": "This week",
    "low_stock_title": "Stock overview",
    "no_low_stock": "Stock is healthy",
    "family_title": "Family members",
    "records_date": "{date}",
    "slot_grid_title": "Blister slots",
    "twin_add_pack": "Add a pack",
    "twin_open_title": "Enable digital twin",
    "plan_medications_empty": "No medications yet",
    "person_pick_hint": "Select a person",
    "form_name_required": "Please enter a name",
    "form_dose_required": "Please enter a dose",
    "settings_about_note": "Reminders do not replace medical advice. Ask your doctor or pharmacist.",
    "medication_daysLeftLabel": "Days left",
    "medication_noPlans": "No medication plans yet",
    "settings_language_system": "Follow system",
    "settings_language_zh": "简体中文",
    "settings_language_en": "English",
    "settings_languagePickerTitle": "Choose language",
    "settings_snoozePickerTitle": "Snooze interval",
    "records_prevDay": "Previous day",
    "records_nextDay": "Next day",
    "records_noAccess": "Cannot open the share sheet",
    "settings_exportShareTitle": "Share medication report",
    # M3 Expressive redesign: search bar / split button / snackbar / home stock row
    "common_undo": "Undo",
    "common_saved": "Saved",
    "medication_searchHint": "Search",
    "medication_voiceSearch": "Voice search",
    "medication_saveAndPlan": "Save & set reminder",
    "medication_saveAndAddAnother": "Save & add another",
    "home_todaySchedule": "Today's schedule",
    "home_stockProgress": "{name}: {percent}% left",
    "voice_unavailable": "Voice input is unavailable on this device",
}


def main() -> int:
    zh = flatten(parse_ts_object(SRC / "zh.ts"))
    en = flatten(parse_ts_object(SRC / "en.ts"))

    missing_in_en = sorted(set(zh) - set(en))
    missing_in_zh = sorted(set(en) - set(zh))
    if missing_in_en or missing_in_zh:
        print("键不一致：", file=sys.stderr)
        for key in missing_in_en:
            print(f"  en 缺 {key}", file=sys.stderr)
        for key in missing_in_zh:
            print(f"  zh 缺 {key}", file=sys.stderr)
        return 1

    OUT_ZH.write_text(render(zh, EXTRA_ZH), encoding="utf-8")
    OUT_EN.write_text(render(en, EXTRA_EN), encoding="utf-8")
    print(f"zh {len({**zh, **EXTRA_ZH})} 条 / en {len({**en, **EXTRA_EN})} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
