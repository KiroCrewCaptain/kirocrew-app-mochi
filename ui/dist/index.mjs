import { activeLocale, fmtDate, fmtNumber, useAppApi, useLanguageGeneration } from "@kirocrew/app-sdk";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Brain, CalendarClock, Camera, Cat, ChevronDown, ChevronRight, ClipboardList, Clock, Eye, Flame, Footprints, MessageSquare, MessagesSquare, Moon, MousePointer2, Pin, Plus, RefreshCw, RotateCcw, ScrollText, Smile, Sun, XCircle } from "lucide-react";
import * as ui from "@kirocrew/app-sdk/ui";
import { Badge, Btn, Card, CardTitle, Clickable, EmptyState, ErrorNotice, PageHeader, StatCard } from "@kirocrew/app-sdk/ui";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var isElectron = !!window.kirocrew?.isElectron;
// src/host/apiError.ts
/**
* The error a failed call to the app's own routes throws, as the dashboard's
* `toApiError` builds it for a gateway answer (`website/src/api/apiError.ts` in
* Kiro Crew): the status, the raw body, and as its message the human text the
* backend put in `error` (or `detail` / `message`), else `HTTP <status>`.
*
* The dashboard's copy also rewrites a few answers no Mochi route gives (a tunnel
* edge's throttle or sign-in page, a full session table) into its own catalog's
* sentences; those strings are the dashboard's, so a refusal of that kind reads
* `HTTP <status>` here.
*/
var ApiError = class extends Error {
	status;
	/** The raw response body, for a caller that reads structured fields. */
	body;
	constructor(status, message, body = "") {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
};
function bodyMessage(body) {
	const trimmed = body.trim();
	if (!trimmed.startsWith("{")) return "";
	try {
		const parsed = JSON.parse(trimmed);
		const value = [
			"error",
			"detail",
			"message"
		].map((key) => parsed?.[key]).find((v) => v != null);
		return typeof value === "string" && value.trim() ? value : "";
	} catch {
		return "";
	}
}
/** Read a failed `Response` once and build the {@link ApiError} for it. */
async function toApiError(r) {
	const body = await r.text().catch(() => "");
	return new ApiError(r.status, bodyMessage(body) || `HTTP ${r.status}`, body);
}
// src/host/appFetch.ts
var transport = null;
/** Route every call through *next* (each root passes `useAppApi()`). */
function setTransport(next) {
	transport = next;
}
function scopedFailure(err) {
	if (!err || typeof err !== "object") return null;
	const { status, body } = err;
	return typeof status === "number" && typeof body === "string" ? {
		status,
		body
	} : null;
}
async function appFetch(path, init) {
	if (!transport) return fetch(path, {
		credentials: "same-origin",
		...init
	});
	try {
		return await transport.raw(path, {
			credentials: "same-origin",
			...init
		});
	} catch (err) {
		const failure = scopedFailure(err);
		if (!failure) throw err;
		return new Response(failure.body, {
			status: failure.status,
			headers: { "Content-Type": "application/json" }
		});
	}
}
// src/api.ts
var API = "/api/apps/mochi";
var TERMINAL_STATUSES = [
	"done",
	"cancelled",
	"failed",
	"expired"
];
async function request(path, init) {
	const res = await appFetch(`${API}${path}`, {
		credentials: "same-origin",
		...init
	});
	if (!res.ok) throw await toApiError(res);
	return await res.json();
}
function post(path, body) {
	return request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
}
function getWatchlist() {
	return request("/watchlist");
}
function updateWatchlist(params) {
	return post("/watchlist/update", params);
}
function getStats() {
	return request("/stats");
}
function getPinned() {
	return request("/pinned");
}
function unpinFile(path) {
	return post("/pinned/unpin", { path });
}
function markPinnedSeen(path) {
	return post("/pinned/mark-seen", { path });
}
function getPetState() {
	return request("/pet-state");
}
function getPlan() {
	return request("/plan");
}
function getActivity() {
	return request("/activity");
}
/**
* Whether the Mochi app is enabled, without treating "disabled" as an error.
*
* The backend's `_require_enabled` guard answers 403 while disabled and 503
* while the runtime has not come up yet, which is precisely the distinction the
* dashboard's landing state needs — a disabled app is offerable (enable it), a
* not-yet-started runtime is transient. Any other failure is reported as an
* error so a genuine outage is not painted as "sleeping".
*/
async function probeEnabled() {
	const res = await appFetch(`${API}/pet-state`, { credentials: "same-origin" });
	if (res.ok) return "enabled";
	if (res.status === 403) return "disabled";
	if (res.status === 503) return "starting";
	throw await toApiError(res);
}
/** Enable the app — reuses core's app registry route, not a Mochi-specific one. */
async function enableMochi() {
	const res = await appFetch("/api/apps/mochi/enable", {
		method: "POST",
		credentials: "same-origin"
	});
	if (!res.ok) throw await toApiError(res);
}
/**
* The app's own version, read from core's manifest route.
*
* The original dashboard took this from the plan payload because its backend was
* a separate versioned process. Here the version is the builtin's manifest
* version, which core already serves — adding a Mochi route for it would be a
* second source of truth.
*/
async function getMochiVersion() {
	const res = await appFetch("/api/apps/mochi/manifest", { credentials: "same-origin" });
	if (!res.ok) return "";
	const body = await res.json();
	const v = body?.version ?? body?.manifest?.version;
	return typeof v === "string" ? v : "";
}
function getSettings() {
	return request("/settings");
}
// src/mochiHelpers.ts
function addToWatchlist(params) {
	return updateWatchlist({ add: [params] });
}
// src/host/format.ts
/**
* The two dashboard formatters Mochi's page uses that the App Kit SDK does not
* export (`fmtDateFields`, `fmtPercent`), with the dashboard's own behaviour
* (`website/src/i18n/format.ts` in Kiro Crew): the host's active language,
* `localeMatcher: 'lookup'`, and a dash for a value that cannot be shown. The
* SDK's `fmtNumber`, `fmtDate` and `activeLocale` are the host's own.
*/
/** What the dashboard shows for a value it cannot format (U+2014). */
var NO_VALUE = "—";
/** A millisecond timestamp below this is read as seconds, as the dashboard does. */
var SECONDS_CEILING = 1e11;
function locale$1() {
	try {
		const value = activeLocale();
		return typeof value === "string" && value ? value : "en";
	} catch {
		return "en";
	}
}
var formatters = /* @__PURE__ */ new Map();
function memo(kind, lng, options, build) {
	const key = `${kind}|${lng}|${JSON.stringify(options ?? null)}`;
	const hit = formatters.get(key);
	if (hit !== void 0) return hit;
	const made = build();
	formatters.set(key, made);
	return made;
}
function toDate(value) {
	if (value === null || value === void 0 || value === "") return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) return null;
		const d = new Date(value < SECONDS_CEILING ? value * 1e3 : value);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}
function dateTime(value, options) {
	const d = toDate(value);
	if (!d) return NO_VALUE;
	const lng = locale$1();
	return memo("datetime", lng, options, () => new Intl.DateTimeFormat(lng, {
		localeMatcher: "lookup",
		...options
	})).format(d);
}
/** A ratio as a percentage (`0.5` reads `50%`), whole percents unless *options* say otherwise. */
function fmtPercent(ratio, options) {
	if (!Number.isFinite(ratio)) return NO_VALUE;
	return fmtNumber(ratio, {
		style: "percent",
		maximumFractionDigits: 0,
		...options
	});
}
/** A date from explicit components (`weekday`, `hour`, ...), never a style preset. */
function fmtDateFields(value, options) {
	return dateTime(value, options);
}
// src/host/codePoints.ts
var isHighSurrogate = (code) => code >= 55296 && code <= 56319;
var isLowSurrogate = (code) => code >= 56320 && code <= 57343;
/** `s.slice(start, end)` with both edges moved off a surrogate pair. A plain
*  UTF-16 slice through an astral character (an emoji) leaves a lone
*  surrogate in the text sent to the agent, which is not valid Unicode and
*  wedges the turn. Edges only ever move inward. */
function sliceCodePoints(s, start, end = s.length) {
	const from = snapOffPair(s, Math.max(0, start), 1);
	const to = snapOffPair(s, Math.min(s.length, end), -1);
	return from < to ? s.slice(from, to) : "";
}
/** Move UTF-16 index `i` off the middle of a surrogate pair: `dir` is +1 for
*  a start edge, -1 for an end edge, so the edge always moves inward. */
function snapOffPair(s, i, dir) {
	return i > 0 && i < s.length && isHighSurrogate(s.charCodeAt(i - 1)) && isLowSurrogate(s.charCodeAt(i)) ? i + dir : i;
}
// src/host/i18n.ts
/**
* The app's own strings. A bundle cannot read the dashboard's catalogs (those
* belong to the host and change with it), so every locale the dashboard ships is
* bundled here and looked up against the host's active language.
*
* The catalogs (`ui/i18n/<locale>.json`) are the groups of Kiro Crew's
* `apps.mochi.*` dashboard catalogs the page names, under the SAME key paths, so
* every call site reads as it did in the built-in. `tests/catalogs.test.ts` pins that every key a source file names
* is in the English catalog.
*
* The rules are the dashboard's (i18next as Kiro Crew configures it): the exact
* locale (`pt`, `zh-CN`), then its base language, then English, then the key
* itself; a numeric `count` picks the plural form the locale's rules name
* (`_one`, `_few`, `_many`, `_other`); an empty string falls through to English;
* `{{name}}` placeholders are filled from `vars`, `{{productName}}` defaults to
* the product's name, a value is inserted literally (never re-read as a
* placeholder), and one with no value is left as written.
*
* `i18nT` reads the language at call time. Each window's root subscribes to the
* host's language changes (`useLanguageGeneration`), and its re-render reaches
* every child, so a language switch repaints without a reload.
*/
var CATALOGS = {
	bn: { apps: /* @__PURE__ */ JSON.parse("{\"mochi\":{\"activity\":{\"type\":{\"budget\":\"বাজেট\",\"memory\":\"স্মৃতি\",\"notification\":\"বিজ্ঞপ্তি\",\"plan\":\"পরিকল্পনা\",\"presence\":\"উপস্থিতি\",\"sleep\":\"ঘুম\",\"spawn\":\"এজেন্ট\",\"system\":\"সিস্টেম\"}},\"instances\":{\"blurb\":\"Mochi একটি একক পোষা প্রাণী, এবং প্রতিটি {{productName}} নিজেরটি চালায়। বেছে নিন এটি কার সঙ্গে থাকবে — শুধু এখন সংযুক্ত ইনস্ট্যান্সগুলো তালিকাভুক্ত।\",\"connecting\":\"সংযোগ করা হচ্ছে…\",\"current\":\"বর্তমান\",\"desktop_only\":\"পেট কোন ইনস্ট্যান্স দেখাবে তা বেছে নিতে ডেস্কটপ অ্যাপ দরকার।\",\"errored\":\"সংযোগ সমস্যা\",\"feature_off\":\"মাল্টি-ইনস্ট্যান্স বন্ধ আছে। দূরবর্তী ইনস্ট্যান্স বেছে নিতে {{productName}} সেটিংসে এটি চালু করুন।\",\"host_disable_note\":\"অন্য কোনও ইনস্ট্যান্সে Mochi বন্ধ করলে শুধু সেই ইনস্ট্যান্সের নিজের ব্যাকগ্রাউন্ড কাজ থামে — তোমার পেট এখানে বেছে নেওয়া ইনস্ট্যান্সেই থাকে।\",\"list_failed\":\"ইনস্ট্যান্স তালিকা পড়া যায়নি।\",\"loading\":\"ইনস্ট্যান্স খোঁজা হচ্ছে…\",\"mochi_off\":\"সেখানে Mochi বন্ধ আছে\",\"needs_restart\":\"মাল্টি-ইনস্ট্যান্স এইমাত্র চালু হয়েছে — সক্রিয় করতে gateway পুনরায় চালু করুন।\",\"not_connected\":\"সংযুক্ত নয়\",\"switch_failed\":\"এখনই ইনস্ট্যান্স বদলানো গেল না — তোমার পছন্দ সংরক্ষিত হয়েছে এবং সেই ইনস্ট্যান্স সাড়া দিলেই কার্যকর হবে।\",\"switch_note\":\"পরিবর্তন করলে চেহারা এবং চ্যাট ইতিহাসও পরিবর্তন হয় — প্রতিটি ইনস্ট্যান্স নিজেরটি রাখে। সংরক্ষিত কোনো ইনস্ট্যান্স হারিয়ে গেলে এই কম্পিউটারে ফিরে আসে।\",\"this_computer\":\"এই কম্পিউটার\"},\"mochiPage\":{\"add_failed\":\"যোগ করা গেল না — তোমার ইনপুট এখানেই আছে, আবার চেষ্টা করো।\",\"add_something_above_or_ask_mochi_to_keep_an_eye\":\"উপরে কিছু যোগ করুন, অথবা Mochi-কে কোনো পৃষ্ঠার উপর নজর রাখতে বলুন\",\"category_name\":\"বিভাগের নাম\",\"changed\":\"পরিবর্তিত\",\"check_again\":\"আবার যাচাই করুন\",\"created\":\"তৈরি হয়েছে\",\"desktop_pet_companion\":\"ডেস্কটপ পোষা সঙ্গী\",\"enable_mochi\":\"Mochi চালু করো\",\"enabling\":\"চালু হচ্ছে…\",\"feat_briefing\":\"দৈনিক ব্রিফিং আর বিরতির রিমাইন্ডার\",\"feat_chat\":\"মার্কডাউন, কোড ব্লক আর টুল অনুমোদনসহ চ্যাট\",\"feat_pet\":\"হাঁটা, উঁকি আর মুড অ্যানিমেশনসহ ডেস্কটপ পোষ্য\",\"feat_screenshot\":\"স্ক্রিনশট ক্যাপচার আর পেজ কনটেক্সট\",\"feat_subagent\":\"ভারী কাজের জন্য সাবএজেন্ট পাঠানো\",\"feat_watch\":\"ওয়াচ লিস্ট — পেজ ও ফিডের বদল ট্র্যাক করো\",\"field_category\":\"শ্রেণি\",\"field_name\":\"নাম\",\"field_target\":\"কী দেখতে হবে\",\"landing_enable_hint\":\"লাইভ স্ট্যাটাস, ওয়াচ লিস্ট আর আজকের পরিকল্পনা দেখতে Mochi চালু করো। পোষ্যটির জন্য {{productName}} ডেস্কটপ অ্যাপ দরকার।\",\"landing_starting\":\"Mochi চালু আছে এবং শুরু হচ্ছে — লাইভ স্ট্যাটাস, ওয়াচ লিস্ট আর আজকের পরিকল্পনা একটু পরেই আসবে।\",\"mark_seen\":\"দেখা হিসেবে চিহ্নিত করুন\",\"mochi_is_sleeping\":\"Mochi ঘুমাচ্ছে\",\"mochi_logs_events_here_as_they_happen\":\"ঘটনা ঘটার সাথে সাথে Mochi সেগুলো এখানে লগ করে\",\"mochi_pins_files_here_when_you_ask_it_to_watch_o\":\"আপনি যখন Mochi-কে কোনো ফাইল নজরে রাখতে বলেন, তখন সে সেগুলো এখানে পিন করে\",\"mochi_s_plan\":\"Mochi-র পরিকল্পনা\",\"mochi_writes_a_plan_when_it_next_wakes_up\":\"Mochi পরের বার জাগলে একটি পরিকল্পনা লেখে\",\"mood\":\"মেজাজ\",\"mood_change\":\"মন → {{value}}\",\"new_category\":\"নতুন বিভাগ…\",\"next\":\"পরবর্তী\",\"next_check\":\"পরবর্তী: {{when}}\",\"no_activity_yet\":\"এখনও কোনো কার্যকলাপ নেই\",\"no_memories_yet\":\"এখনও কোনো স্মৃতি নেই\",\"no_pinned_files\":\"কোনো পিন করা ফাইল নেই\",\"no_plan_yet\":\"এখনও কোনো পরিকল্পনা নেই\",\"notes\":\"নোট\",\"nothing_being_watched\":\"কিছুই নজরে রাখা হচ্ছে না\",\"page_range\":\"{{total}}-এর মধ্যে {{from}}–{{to}}\",\"pinned_files\":\"পিন করা ফাইল\",\"prev\":\"পূর্ববর্তী\",\"recent_activity\":\"সাম্প্রতিক কার্যকলাপ\",\"refresh\":\"রিফ্রেশ করুন\",\"spend_time_with_mochi_to_build_memories\":\"স্মৃতি গড়ে তুলতে Mochi-র সাথে সময় কাটান\",\"status\":\"স্ট্যাটাস\",\"stop_watching\":\"নজর রাখা বন্ধ করুন\",\"this_is_the_browser_view_everything_here_is_live\":\"এটি ব্রাউজার ভিউ। এখানে সবকিছু লাইভ, তবে পোষা প্রাণীর উইন্ডো\\n            নিজে শুধু {{productName}} ডেস্কটপ অ্যাপে প্রদর্শিত হয়।\",\"top_moods\":\"শীর্ষ মেজাজ\",\"trigger\":\"ট্রিগার\",\"url_or_what_to_watch\":\"URL বা যা নজরে রাখতে হবে\",\"version\":\"সংস্করণ\",\"watch\":\"নজর রাখুন\",\"what_mochi_can_do\":\"Mochi কী করতে পারে\",\"what_to_call_it\":\"এটিকে কী নামে ডাকবেন\"},\"mood\":{\"busy\":\"ব্যস্ত\",\"curious\":\"কৌতূহলী\",\"happy\":\"খুশি\",\"scared\":\"ভীত\",\"sleepy\":\"ঘুমঘুম\"},\"pinned\":{\"empty_hint\":\"আপনি যে ফাইলগুলো ট্র্যাক করতে চান সেগুলো পিন করতে {{name}}-কে বলুন\",\"unpin\":\"আনপিন করুন\"},\"state\":{\"approval_pending\":\"অনুমোদন অপেক্ষমাণ\",\"done\":\"সম্পন্ন\",\"error\":\"ত্রুটি\",\"hiding\":\"লুকাচ্ছে\",\"idle\":\"নিষ্ক্রিয়\",\"listening\":\"শুনছে\",\"offline\":\"অফলাইন\",\"peekThinking\":\"উঁকি ও চিন্তা\",\"peeking\":\"উঁকি দিচ্ছে\",\"thinking\":\"ভাবছে\",\"walking\":\"হাঁটছে\",\"working\":\"কাজ করছে\"},\"stats\":{\"busiest_day_one\":\"সবচেয়ে আড্ডাবাজ দিন: {{date}} ({{n}} বার্তা)\",\"busiest_day_other\":\"সবচেয়ে আড্ডাবাজ দিন: {{date}} ({{n}} বার্তা)\",\"companion_days\":\"একসাথে {{time}} ধরে\",\"drags_one\":\"{{n}} বার টেনে নেওয়া হয়েছে\",\"drags_other\":\"{{n}} বার টেনে নেওয়া হয়েছে\",\"earliest_time\":\"সবচেয়ে আগে: {{time}}-এ উঠেছে\",\"first_use\":\"{{name}}-এর সাথে আপনার গল্প কেবল শুরু হলো\",\"latest_time\":\"সবচেয়ে দেরিতে: {{time}} পর্যন্ত জেগে ছিল\",\"longest_chat_one\":\"দীর্ঘতম চ্যাট: {{n}} বার্তা\",\"longest_chat_other\":\"দীর্ঘতম চ্যাট: {{n}} বার্তা\",\"messages\":\"{{total}} বার্তা ({{sent}} আপনি · {{received}} {{name}})\",\"mood_top\":\"মেজাজ\",\"peeks_one\":\"{{n}} বার উঁকি দিয়েছে\",\"peeks_other\":\"{{n}} বার উঁকি দিয়েছে\",\"screenshots_one\":\"{{n}} বার তোমার স্ক্রিন দেখেছে\",\"screenshots_other\":\"{{n}} বার তোমার স্ক্রিন দেখেছে\",\"streak\":\"({{streak}} দিনের ধারা)\",\"thinking_time\":\"{{time}} ধরে ভেবেছে\",\"title\":\"স্মৃতি\",\"walks_one\":\"{{n}} পদক্ষেপ\",\"walks_other\":\"{{n}} পদক্ষেপ\"},\"watchPanel\":{\"back\":\"পেছনে\",\"clear_cancel\":\"রেখে দিন\",\"clear_completed\":\"সব সম্পন্ন মুছে ফেলুন\",\"clear_confirm\":\"মুছুন\",\"clear_confirm_desc_one\":\"{{count}}টি সম্পন্ন আইটেম মুছে যাবে। এটি ফেরানো যাবে না।\",\"clear_confirm_desc_other\":\"{{count}}টি সম্পন্ন আইটেম মুছে যাবে। এটি ফেরানো যাবে না।\",\"clear_confirm_title\":\"সম্পন্নগুলি মুছে ফেলবেন?\",\"clear_dismiss\":\"বন্ধ করুন\",\"clear_failed\":\"মোছা গেল না। কিছুই মুছে যায়নি — আবার চেষ্টা করুন।\",\"clear_working\":\"মুছছে…\",\"close\":\"বন্ধ করুন\",\"complete\":\"সম্পন্ন করুন\",\"countdown\":{\"hours\":\"{{hours}} ঘণ্টা {{mins}} মিনিট বাকি\",\"mins\":\"{{mins}} মিনিট বাকি\"},\"empty\":\"কোনো আইটেম নজরে রাখা হচ্ছে না\",\"empty_hint\":\"একটি দাম, একটি ডেলিভারি বা একটি ওয়েব পৃষ্ঠা নজরে রাখতে {{name}}-কে বলুন\",\"field\":{\"check_count\":\"যাচাই সংখ্যা\",\"history\":\"ইতিহাস\",\"interval\":\"যাচাই ব্যবধান\",\"last_checked\":\"সর্বশেষ যাচাই\",\"last_result\":\"সর্বশেষ ফলাফল\",\"next_check\":\"পরবর্তী যাচাই\",\"notes\":\"নোট\",\"priority\":\"অগ্রাধিকার\",\"target\":\"লক্ষ্য\",\"trigger_at\":\"ট্রিগার সময়\"},\"hide_completed\":\"সম্পন্নগুলো লুকান\",\"history\":{\"no_changes\":\"এখনও কোনো পরিবর্তন শনাক্ত হয়নি\",\"show_all\":\"সব দেখান ({{count}})\",\"show_changes\":\"শুধু পরিবর্তন\"},\"kind\":{\"custom\":\"নিজের\",\"meeting\":\"মিটিং\",\"reminder\":\"মনে করানো\",\"url\":\"ওয়েব পেজ\"},\"older_completed\":\"আগেরগুলো\",\"overdue\":\"শীঘ্রই যাচাই হবে\",\"priority\":{\"high\":\"উচ্চ\",\"low\":\"নিম্ন\",\"normal\":\"স্বাভাবিক\"},\"recent_completed\":\"সম্প্রতি সম্পন্ন\",\"reopen\":\"আবার খুলুন\",\"save\":\"সংরক্ষণ করুন\",\"show_completed\":\"সম্পন্নগুলো দেখান ({{count}})\",\"status\":{\"cancelled\":\"বাতিল\",\"done\":\"সম্পন্ন\",\"expired\":\"মেয়াদোত্তীর্ণ\",\"failed\":\"ব্যর্থ\",\"triggered\":\"ট্রিগার হয়েছে\",\"watching\":\"নজরে রাখা হচ্ছে\"},\"title\":\"নজর তালিকা\"}}}") },
	de: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "Budget",
			"memory": "Erinnerung",
			"notification": "Hinweis",
			"plan": "Plan",
			"presence": "Anwesenheit",
			"sleep": "Schlaf",
			"spawn": "Agent",
			"system": "System"
		} },
		"instances": {
			"blurb": "Mochi ist ein einzelnes Haustier, und jedes {{productName}} hat sein eigenes. Wähle, wem es Gesellschaft leistet — nur gerade verbundene Instanzen werden angezeigt.",
			"connecting": "wird verbunden…",
			"current": "aktuell",
			"desktop_only": "Die Auswahl der Instanz, die das Haustier zeigt, benötigt die Desktop-App.",
			"errored": "Verbindungsproblem",
			"feature_off": "Multi-Instanz ist deaktiviert. Aktiviere es in den {{productName}}-Einstellungen, um eine Remote-Instanz auszuwählen.",
			"host_disable_note": "Mochi auf einer anderen Instanz zu deaktivieren stoppt nur die eigene Hintergrundarbeit dieser Instanz — dein Haustier bleibt auf der Instanz, die du hier auswählst.",
			"list_failed": "Die Instanzliste konnte nicht gelesen werden.",
			"loading": "Suche nach Instanzen…",
			"mochi_off": "Mochi ist dort deaktiviert",
			"needs_restart": "Multi-Instanz wurde gerade aktiviert — starte das Gateway neu, um es zu aktivieren.",
			"not_connected": "nicht verbunden",
			"switch_failed": "Instanz konnte gerade nicht gewechselt werden — deine Auswahl ist gespeichert und wird angewendet, sobald diese Instanz antwortet.",
			"switch_note": "Beim Wechseln wechseln auch Erscheinungsbild und Chat-Verlauf — jede Instanz behält ihr eigenes. Eine gespeicherte Instanz, die verschwindet, fällt auf diesen Computer zurück.",
			"this_computer": "Dieser Computer"
		},
		"mochiPage": {
			"add_failed": "Konnte nicht hinzugefügt werden — deine Eingabe ist noch da, versuch es nochmal.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "Füge oben etwas hinzu oder bitte Mochi, eine Seite im Auge zu behalten",
			"category_name": "Kategoriename",
			"changed": "geändert",
			"check_again": "Erneut prüfen",
			"created": "Erstellt",
			"desktop_pet_companion": "Desktop-Haustierbegleiter",
			"enable_mochi": "Mochi aktivieren",
			"enabling": "Wird aktiviert…",
			"feat_briefing": "Tägliche Briefings und Pausenerinnerungen",
			"feat_chat": "Chat mit Markdown, Codeblöcken und Tool-Freigaben",
			"feat_pet": "Desktop-Haustier mit Lauf-, Guck- und Stimmungsanimationen",
			"feat_screenshot": "Screenshot-Aufnahme und Seitenkontext",
			"feat_subagent": "Subagenten für schwere Aufgaben",
			"feat_watch": "Beobachtungsliste — Seiten und Feeds auf Änderungen prüfen",
			"field_category": "Kategorie",
			"field_name": "Name",
			"field_target": "Was beobachten",
			"landing_enable_hint": "Aktiviere Mochi für Live-Status, Beobachtungsliste und den heutigen Plan. Das Haustier selbst braucht die {{productName}}-Desktop-App.",
			"landing_starting": "Mochi ist aktiviert und startet — Live-Status, Beobachtungsliste und der heutige Plan erscheinen gleich.",
			"mark_seen": "Als gesehen markieren",
			"mochi_is_sleeping": "Mochi schläft",
			"mochi_logs_events_here_as_they_happen": "Mochi protokolliert Ereignisse hier, sobald sie passieren",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "Mochi heftet Dateien hier an, wenn du es bittest, eine zu beobachten",
			"mochi_s_plan": "Mochis Plan",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi schreibt einen Plan, wenn es das nächste Mal aufwacht",
			"mood": "Stimmung",
			"mood_change": "Stimmung → {{value}}",
			"new_category": "Neue Kategorie…",
			"next": "Weiter",
			"next_check": "Nächste: {{when}}",
			"no_activity_yet": "Noch keine Aktivität",
			"no_memories_yet": "Noch keine Erinnerungen",
			"no_pinned_files": "Keine angehefteten Dateien",
			"no_plan_yet": "Noch kein Plan",
			"notes": "Notizen",
			"nothing_being_watched": "Nichts wird beobachtet",
			"page_range": "{{from}}–{{to}} von {{total}}",
			"pinned_files": "Angeheftete Dateien",
			"prev": "Zurück",
			"recent_activity": "Letzte Aktivität",
			"refresh": "Aktualisieren",
			"spend_time_with_mochi_to_build_memories": "Verbringe Zeit mit Mochi, um Erinnerungen zu schaffen",
			"status": "Status",
			"stop_watching": "Beobachtung beenden",
			"this_is_the_browser_view_everything_here_is_live": "Dies ist die Browser-Ansicht. Alles hier ist live, aber das Haustier-Fenster\n            selbst erscheint nur in der {{productName}}-Desktop-App.",
			"top_moods": "Top-Stimmungen",
			"trigger": "Auslöser",
			"url_or_what_to_watch": "URL oder was beobachtet werden soll",
			"version": "Version",
			"watch": "Beobachten",
			"what_mochi_can_do": "Was Mochi kann",
			"what_to_call_it": "Wie soll es heißen"
		},
		"mood": {
			"busy": "Beschäftigt",
			"curious": "Neugierig",
			"happy": "Glücklich",
			"scared": "Verängstigt",
			"sleepy": "Schläfrig"
		},
		"pinned": {
			"empty_hint": "Bitte {{name}}, Dateien anzuheften, die du verfolgen möchtest",
			"unpin": "Lösen"
		},
		"state": {
			"approval_pending": "Genehmigung ausstehend",
			"done": "Fertig",
			"error": "Fehler",
			"hiding": "Versteckt sich",
			"idle": "Leerlauf",
			"listening": "Hört zu",
			"offline": "Offline",
			"peekThinking": "Lugen & Denken",
			"peeking": "Lugt",
			"thinking": "Denkt",
			"walking": "Läuft",
			"working": "Arbeitet"
		},
		"stats": {
			"busiest_day_one": "Gesprächigster Tag: {{date}} ({{n}} Nachr.)",
			"busiest_day_other": "Gesprächigster Tag: {{date}} ({{n}} Nachr.)",
			"companion_days": "Zusammen seit {{time}}",
			"drags_one": "{{n}}-mal gezogen",
			"drags_other": "{{n}}-mal gezogen",
			"earliest_time": "Am frühesten: wach um {{time}}",
			"first_use": "Deine Geschichte mit {{name}} hat gerade begonnen",
			"latest_time": "Am spätesten: wach bis {{time}}",
			"longest_chat_one": "Längster Chat: {{n}} Nachricht",
			"longest_chat_other": "Längster Chat: {{n}} Nachrichten",
			"messages": "{{total}} Nachrichten ({{sent}} du · {{received}} {{name}})",
			"mood_top": "Stimmungen",
			"peeks_one": "{{n}}-mal gelugt",
			"peeks_other": "{{n}}-mal gelugt",
			"screenshots_one": "{{n}}-mal auf deinen Bildschirm geschaut",
			"screenshots_other": "{{n}}-mal auf deinen Bildschirm geschaut",
			"streak": "({{streak}}-Tage-Serie)",
			"thinking_time": "{{time}} nachgedacht",
			"title": "Erinnerungen",
			"walks_one": "{{n}} Schritt",
			"walks_other": "{{n}} Schritte"
		},
		"watchPanel": {
			"back": "Zurück",
			"clear_cancel": "Behalten",
			"clear_completed": "Alle abgeschlossenen löschen",
			"clear_confirm": "Löschen",
			"clear_confirm_desc_one": "Löscht {{count}} erledigten Eintrag. Das kannst du nicht zurücknehmen.",
			"clear_confirm_desc_other": "Löscht {{count}} erledigte Einträge. Das kannst du nicht zurücknehmen.",
			"clear_confirm_title": "Erledigte löschen?",
			"clear_dismiss": "Schließen",
			"clear_failed": "Löschen fehlgeschlagen. Es wurde nichts gelöscht — versuch es erneut.",
			"clear_working": "Wird gelöscht…",
			"close": "Schließen",
			"complete": "Abschließen",
			"countdown": {
				"hours": "noch {{hours}} Std {{mins}} Min",
				"mins": "noch {{mins}} Min"
			},
			"empty": "Keine beobachteten Elemente",
			"empty_hint": "Bitte {{name}}, einen Preis, eine Lieferung oder eine Webseite zu beobachten",
			"field": {
				"check_count": "Anzahl der Prüfungen",
				"history": "Verlauf",
				"interval": "Prüfintervall",
				"last_checked": "Zuletzt geprüft",
				"last_result": "Letztes Ergebnis",
				"next_check": "Nächste Prüfung",
				"notes": "Notizen",
				"priority": "Priorität",
				"target": "Ziel",
				"trigger_at": "Auslösezeit"
			},
			"hide_completed": "Abgeschlossene ausblenden",
			"history": {
				"no_changes": "Noch keine Änderungen erkannt",
				"show_all": "Alle anzeigen ({{count}})",
				"show_changes": "Nur Änderungen"
			},
			"kind": {
				"custom": "Eigene",
				"meeting": "Termin",
				"reminder": "Erinnerung",
				"url": "Webseite"
			},
			"older_completed": "Frühere",
			"overdue": "Wird bald geprüft",
			"priority": {
				"high": "Hoch",
				"low": "Niedrig",
				"normal": "Normal"
			},
			"recent_completed": "Kürzlich abgeschlossen",
			"reopen": "Wieder öffnen",
			"save": "Speichern",
			"show_completed": "Abgeschlossene anzeigen ({{count}})",
			"status": {
				"cancelled": "Abgebrochen",
				"done": "Fertig",
				"expired": "Abgelaufen",
				"failed": "Fehlgeschlagen",
				"triggered": "Ausgelöst",
				"watching": "Wird beobachtet"
			},
			"title": "Beobachtungsliste"
		}
	} } },
	en: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "Budget",
			"memory": "Memory",
			"notification": "Notification",
			"plan": "Plan",
			"presence": "Presence",
			"sleep": "Sleep",
			"spawn": "Agent",
			"system": "System"
		} },
		"instances": {
			"blurb": "Mochi is one pet, and every {{productName}} runs its own. Pick whose company it keeps — only instances connected right now are listed.",
			"connecting": "connecting…",
			"current": "current",
			"desktop_only": "Choosing which instance the pet shows needs the desktop app.",
			"errored": "connection problem",
			"feature_off": "Multi-instance is turned off. Enable it in {{productName}} Settings to pick a remote instance.",
			"host_disable_note": "Turning Mochi off on another instance only stops that instance's own background work — your pet stays on the instance you pick here.",
			"list_failed": "Could not read the instance list.",
			"loading": "Looking for instances…",
			"mochi_off": "Mochi is turned off there",
			"needs_restart": "Multi-instance was just enabled — restart the gateway to activate it.",
			"not_connected": "not connected",
			"switch_failed": "Could not switch instance right now — your choice is saved and applies as soon as that instance responds.",
			"switch_note": "Switching also switches appearance and chat history — each instance keeps its own. A saved instance that goes away falls back to this computer.",
			"this_computer": "This computer"
		},
		"mochiPage": {
			"add_failed": "Could not add that — your input is still here, try again.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "Add something above, or ask Mochi to keep an eye on a page",
			"category_name": "Category name",
			"changed": "changed",
			"check_again": "Check again",
			"created": "Created",
			"desktop_pet_companion": "Desktop pet companion",
			"enable_mochi": "Enable Mochi",
			"enabling": "Enabling…",
			"feat_briefing": "Daily briefings and break reminders",
			"feat_chat": "Chat with markdown, code blocks, tool approvals",
			"feat_pet": "Desktop pet with walk, peek, and mood animations",
			"feat_screenshot": "Screenshot capture and page context",
			"feat_subagent": "Subagent dispatch for heavy tasks",
			"feat_watch": "Watch list — track pages and feeds for changes",
			"field_category": "Category",
			"field_name": "Name",
			"field_target": "What to watch",
			"landing_enable_hint": "Enable Mochi to see live status, watch list, and today's plan. The pet itself needs the {{productName}} desktop app.",
			"landing_starting": "Mochi is enabled and starting up — live status, watch list and today's plan appear in a moment.",
			"mark_seen": "Mark seen",
			"mochi_is_sleeping": "Mochi is sleeping",
			"mochi_logs_events_here_as_they_happen": "Mochi logs events here as they happen",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "Mochi pins files here when you ask it to watch one",
			"mochi_s_plan": "Mochi’s Plan",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi writes a plan when it next wakes up",
			"mood": "Mood",
			"mood_change": "Mood → {{value}}",
			"new_category": "New category…",
			"next": "Next",
			"next_check": "Next: {{when}}",
			"no_activity_yet": "No activity yet",
			"no_memories_yet": "No memories yet",
			"no_pinned_files": "No pinned files",
			"no_plan_yet": "No plan yet",
			"notes": "Notes",
			"nothing_being_watched": "Nothing being watched",
			"page_range": "{{from}}–{{to}} of {{total}}",
			"pinned_files": "Pinned files",
			"prev": "Prev",
			"recent_activity": "Recent Activity",
			"refresh": "Refresh",
			"spend_time_with_mochi_to_build_memories": "Spend time with Mochi to build memories",
			"status": "Status",
			"stop_watching": "Stop watching",
			"this_is_the_browser_view_everything_here_is_live": "This is the browser view. Everything here is live, but the pet window\n            itself only appears in the {{productName}} desktop app.",
			"top_moods": "Top moods",
			"trigger": "Trigger",
			"url_or_what_to_watch": "URL or what to watch",
			"version": "Version",
			"watch": "Watch",
			"what_mochi_can_do": "What Mochi can do",
			"what_to_call_it": "What to call it"
		},
		"mood": {
			"busy": "Busy",
			"curious": "Curious",
			"happy": "Happy",
			"scared": "Scared",
			"sleepy": "Sleepy"
		},
		"pinned": {
			"empty_hint": "Ask {{name}} to pin files you want to track",
			"unpin": "Unpin"
		},
		"state": {
			"approval_pending": "Approval Pending",
			"done": "Done",
			"error": "Error",
			"hiding": "Hiding",
			"idle": "Idle",
			"listening": "Listening",
			"offline": "Offline",
			"peekThinking": "Peek & Think",
			"peeking": "Peeking",
			"thinking": "Thinking",
			"walking": "Walking",
			"working": "Working"
		},
		"stats": {
			"busiest_day_one": "Chattiest day: {{date}} ({{n}} msg)",
			"busiest_day_other": "Chattiest day: {{date}} ({{n}} msgs)",
			"companion_days": "Together for {{time}}",
			"drags_one": "Dragged {{n}} time",
			"drags_other": "Dragged {{n}} times",
			"earliest_time": "Earliest: up at {{time}}",
			"first_use": "Your story with {{name}} just began",
			"latest_time": "Latest: stayed up till {{time}}",
			"longest_chat_one": "Longest chat: {{n}} message",
			"longest_chat_other": "Longest chat: {{n}} messages",
			"messages": "{{total}} messages ({{sent}} you · {{received}} {{name}})",
			"mood_top": "Moods",
			"peeks_one": "Peeked {{n}} time",
			"peeks_other": "Peeked {{n}} times",
			"screenshots_one": "Looked at your screen {{n}} time",
			"screenshots_other": "Looked at your screen {{n}} times",
			"streak": "({{streak}}-day streak)",
			"thinking_time": "Thought for {{time}}",
			"title": "Memories",
			"walks_one": "{{n}} step",
			"walks_other": "{{n}} steps"
		},
		"watchPanel": {
			"back": "Back",
			"clear_cancel": "Keep them",
			"clear_completed": "Clear all completed",
			"clear_confirm": "Clear",
			"clear_confirm_desc_one": "Deletes {{count}} completed item. This cannot be undone.",
			"clear_confirm_desc_other": "Deletes {{count}} completed items. This cannot be undone.",
			"clear_confirm_title": "Clear completed?",
			"clear_dismiss": "Close",
			"clear_failed": "Could not clear them. Nothing was deleted — try again.",
			"clear_working": "Clearing…",
			"close": "Close",
			"complete": "Complete",
			"countdown": {
				"hours": "{{hours}}h {{mins}}m left",
				"mins": "{{mins}}m left"
			},
			"empty": "No items being watched",
			"empty_hint": "Ask {{name}} to watch a price, a delivery, or a web page",
			"field": {
				"check_count": "Check Count",
				"history": "History",
				"interval": "Check Interval",
				"last_checked": "Last Checked",
				"last_result": "Last Result",
				"next_check": "Next Check",
				"notes": "Notes",
				"priority": "Priority",
				"target": "Target",
				"trigger_at": "Trigger Time"
			},
			"hide_completed": "Hide completed",
			"history": {
				"no_changes": "No changes detected yet",
				"show_all": "Show all ({{count}})",
				"show_changes": "Changes only"
			},
			"kind": {
				"custom": "Custom",
				"meeting": "Meeting",
				"reminder": "Reminder",
				"url": "Web page"
			},
			"older_completed": "Earlier",
			"overdue": "Checking soon",
			"priority": {
				"high": "High",
				"low": "Low",
				"normal": "Normal"
			},
			"recent_completed": "Recently completed",
			"reopen": "Reopen",
			"save": "Save",
			"show_completed": "Show completed ({{count}})",
			"status": {
				"cancelled": "Cancelled",
				"done": "Done",
				"expired": "Expired",
				"failed": "Failed",
				"triggered": "Triggered",
				"watching": "Watching"
			},
			"title": "Watch List"
		}
	} } },
	es: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "Presupuesto",
			"memory": "Memoria",
			"notification": "Aviso",
			"plan": "Plan",
			"presence": "Presencia",
			"sleep": "Sueño",
			"spawn": "Agente",
			"system": "Sistema"
		} },
		"instances": {
			"blurb": "Mochi es una sola mascota, y cada {{productName}} tiene la suya. Elige a quién acompaña — solo se muestran las instancias conectadas ahora mismo.",
			"connecting": "conectando…",
			"current": "actual",
			"desktop_only": "Elegir qué instancia muestra la mascota requiere la aplicación de escritorio.",
			"errored": "problema de conexión",
			"feature_off": "El modo multiinstancia está desactivado. Actívalo en la Configuración de {{productName}} para elegir una instancia remota.",
			"host_disable_note": "Desactivar Mochi en otra instancia solo detiene el trabajo en segundo plano de esa instancia: tu mascota permanece en la instancia que elijas aquí.",
			"list_failed": "No se pudo leer la lista de instancias.",
			"loading": "Buscando instancias…",
			"mochi_off": "Mochi está desactivado allí",
			"needs_restart": "El modo multiinstancia se acaba de activar — reinicia el gateway para activarlo.",
			"not_connected": "no conectado",
			"switch_failed": "No se pudo cambiar de instancia ahora mismo: tu elección está guardada y se aplicará en cuanto esa instancia responda.",
			"switch_note": "Cambiar también cambia la apariencia y el historial de chat — cada instancia conserva el suyo. Una instancia guardada que desaparece recurre a esta computadora.",
			"this_computer": "Esta computadora"
		},
		"mochiPage": {
			"add_failed": "No se pudo añadir: tu texto sigue aquí, inténtalo otra vez.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "Agrega algo arriba o pídele a Mochi que vigile una página",
			"category_name": "Nombre de la categoría",
			"changed": "cambiado",
			"check_again": "Comprobar de nuevo",
			"created": "Creado",
			"desktop_pet_companion": "Mascota de escritorio",
			"enable_mochi": "Activar Mochi",
			"enabling": "Activando…",
			"feat_briefing": "Resúmenes diarios y recordatorios de descanso",
			"feat_chat": "Chat con markdown, bloques de código y aprobación de herramientas",
			"feat_pet": "Mascota de escritorio con animaciones de paseo, asomarse y ánimo",
			"feat_screenshot": "Captura de pantalla y contexto de la página",
			"feat_subagent": "Envío de subagentes para tareas pesadas",
			"feat_watch": "Lista de seguimiento: vigila cambios en páginas y feeds",
			"field_category": "Categoría",
			"field_name": "Nombre",
			"field_target": "Qué vigilar",
			"landing_enable_hint": "Activa Mochi para ver el estado en vivo, la lista de seguimiento y el plan de hoy. La mascota necesita la app de escritorio de {{productName}}.",
			"landing_starting": "Mochi está activado e iniciándose: el estado en vivo, la lista de seguimiento y el plan de hoy aparecen en un momento.",
			"mark_seen": "Marcar como visto",
			"mochi_is_sleeping": "Mochi está durmiendo",
			"mochi_logs_events_here_as_they_happen": "Mochi registra los eventos aquí a medida que ocurren",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "Mochi fija los archivos aquí cuando le pides que vigile uno",
			"mochi_s_plan": "Plan de Mochi",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi escribe un plan la próxima vez que despierta",
			"mood": "Estado de ánimo",
			"mood_change": "Ánimo → {{value}}",
			"new_category": "Nueva categoría…",
			"next": "Siguiente",
			"next_check": "Siguiente: {{when}}",
			"no_activity_yet": "Aún no hay actividad",
			"no_memories_yet": "Aún no hay recuerdos",
			"no_pinned_files": "No hay archivos fijados",
			"no_plan_yet": "Aún no hay plan",
			"notes": "Notas",
			"nothing_being_watched": "No se está vigilando nada",
			"page_range": "{{from}}–{{to}} de {{total}}",
			"pinned_files": "Archivos fijados",
			"prev": "Anterior",
			"recent_activity": "Actividad reciente",
			"refresh": "Actualizar",
			"spend_time_with_mochi_to_build_memories": "Pasa tiempo con Mochi para crear recuerdos",
			"status": "Estado",
			"stop_watching": "Dejar de vigilar",
			"this_is_the_browser_view_everything_here_is_live": "Esta es la vista del navegador. Todo aquí está en vivo, pero la ventana de la mascota\n            solo aparece en la aplicación de escritorio de {{productName}}.",
			"top_moods": "Estados de ánimo principales",
			"trigger": "Activador",
			"url_or_what_to_watch": "URL o qué vigilar",
			"version": "Versión",
			"watch": "Vigilar",
			"what_mochi_can_do": "Qué puede hacer Mochi",
			"what_to_call_it": "Cómo llamarlo"
		},
		"mood": {
			"busy": "Ocupado",
			"curious": "Curioso",
			"happy": "Feliz",
			"scared": "Asustado",
			"sleepy": "Somnoliento"
		},
		"pinned": {
			"empty_hint": "Pídele a {{name}} que fije los archivos que quieras seguir",
			"unpin": "Dejar de fijar"
		},
		"state": {
			"approval_pending": "Aprobación pendiente",
			"done": "Listo",
			"error": "Error",
			"hiding": "Ocultándose",
			"idle": "Inactivo",
			"listening": "Escuchando",
			"offline": "Sin conexión",
			"peekThinking": "Asomar y pensar",
			"peeking": "Asomándose",
			"thinking": "Pensando",
			"walking": "Caminando",
			"working": "Trabajando"
		},
		"stats": {
			"busiest_day_many": "Día más hablador: {{date}} ({{n}} msjs)",
			"busiest_day_one": "Día más hablador: {{date}} ({{n}} msj)",
			"busiest_day_other": "Día más hablador: {{date}} ({{n}} msjs)",
			"companion_days": "Juntos desde hace {{time}}",
			"drags_many": "Arrastrado {{n}} veces",
			"drags_one": "Arrastrado {{n}} vez",
			"drags_other": "Arrastrado {{n}} veces",
			"earliest_time": "Lo más temprano: en pie a las {{time}}",
			"first_use": "Tu historia con {{name}} acaba de empezar",
			"latest_time": "Lo más tarde: despierto hasta las {{time}}",
			"longest_chat_many": "Charla más larga: {{n}} mensajes",
			"longest_chat_one": "Charla más larga: {{n}} mensaje",
			"longest_chat_other": "Charla más larga: {{n}} mensajes",
			"messages": "{{total}} mensajes ({{sent}} tú · {{received}} {{name}})",
			"mood_top": "Estados de ánimo",
			"peeks_many": "Se asomó {{n}} veces",
			"peeks_one": "Se asomó {{n}} vez",
			"peeks_other": "Se asomó {{n}} veces",
			"screenshots_many": "Miró tu pantalla {{n}} veces",
			"screenshots_one": "Miró tu pantalla {{n}} vez",
			"screenshots_other": "Miró tu pantalla {{n}} veces",
			"streak": "(racha de {{streak}} días)",
			"thinking_time": "Pensó durante {{time}}",
			"title": "Recuerdos",
			"walks_many": "{{n}} pasos",
			"walks_one": "{{n}} paso",
			"walks_other": "{{n}} pasos"
		},
		"watchPanel": {
			"back": "Atrás",
			"clear_cancel": "Conservarlos",
			"clear_completed": "Borrar todo lo completado",
			"clear_confirm": "Borrar",
			"clear_confirm_desc_many": "Elimina {{count}} de elementos completados. No se puede deshacer.",
			"clear_confirm_desc_one": "Elimina {{count}} elemento completado. No se puede deshacer.",
			"clear_confirm_desc_other": "Elimina {{count}} elementos completados. No se puede deshacer.",
			"clear_confirm_title": "¿Borrar los completados?",
			"clear_dismiss": "Cerrar",
			"clear_failed": "No se pudieron borrar. No se eliminó nada: inténtalo de nuevo.",
			"clear_working": "Borrando…",
			"close": "Cerrar",
			"complete": "Completar",
			"countdown": {
				"hours": "quedan {{hours}} h {{mins}} min",
				"mins": "quedan {{mins}} min"
			},
			"empty": "No hay elementos en seguimiento",
			"empty_hint": "Pídele a {{name}} que vigile un precio, una entrega o una página web",
			"field": {
				"check_count": "Número de revisiones",
				"history": "Historial",
				"interval": "Intervalo de revisión",
				"last_checked": "Última revisión",
				"last_result": "Último resultado",
				"next_check": "Próxima revisión",
				"notes": "Notas",
				"priority": "Prioridad",
				"target": "Objetivo",
				"trigger_at": "Hora de activación"
			},
			"hide_completed": "Ocultar completados",
			"history": {
				"no_changes": "Aún no se detectan cambios",
				"show_all": "Mostrar todo ({{count}})",
				"show_changes": "Solo cambios"
			},
			"kind": {
				"custom": "Personalizada",
				"meeting": "Reunión",
				"reminder": "Recordatorio",
				"url": "Página web"
			},
			"older_completed": "Anteriores",
			"overdue": "Se revisará pronto",
			"priority": {
				"high": "Alta",
				"low": "Baja",
				"normal": "Normal"
			},
			"recent_completed": "Completados recientemente",
			"reopen": "Reabrir",
			"save": "Guardar",
			"show_completed": "Mostrar completados ({{count}})",
			"status": {
				"cancelled": "Cancelado",
				"done": "Listo",
				"expired": "Caducado",
				"failed": "Falló",
				"triggered": "Activado",
				"watching": "Vigilando"
			},
			"title": "Lista de seguimiento"
		}
	} } },
	fr: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "Budget",
			"memory": "Mémoire",
			"notification": "Notification",
			"plan": "Plan",
			"presence": "Présence",
			"sleep": "Sommeil",
			"spawn": "Agent",
			"system": "Système"
		} },
		"instances": {
			"blurb": "Mochi est un seul animal, et chaque {{productName}} a le sien. Choisissez qui il accompagne — seules les instances connectées en ce moment sont affichées.",
			"connecting": "connexion…",
			"current": "actuelle",
			"desktop_only": "Choisir l'instance affichée par le compagnon nécessite l'application de bureau.",
			"errored": "problème de connexion",
			"feature_off": "Le mode multi-instance est désactivé. Activez-le dans les Paramètres de {{productName}} pour choisir une instance distante.",
			"host_disable_note": "Désactiver Mochi sur une autre instance arrête seulement le travail en arrière-plan de cette instance — ton compagnon reste sur l'instance que tu choisis ici.",
			"list_failed": "Impossible de lire la liste des instances.",
			"loading": "Recherche d'instances…",
			"mochi_off": "Mochi est désactivé là-bas",
			"needs_restart": "Le mode multi-instance vient d'être activé — redémarrez le gateway pour l'activer.",
			"not_connected": "non connectée",
			"switch_failed": "Impossible de changer d'instance pour le moment — ton choix est enregistré et s'appliquera dès que cette instance répondra.",
			"switch_note": "Changer d'instance change aussi l'apparence et l'historique du chat — chaque instance conserve les siens. Une instance enregistrée qui disparaît revient à cet ordinateur.",
			"this_computer": "Cet ordinateur"
		},
		"mochiPage": {
			"add_failed": "Ajout impossible — ta saisie est toujours là, réessaie.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "Ajoutez quelque chose ci-dessus, ou demandez à Mochi de surveiller une page",
			"category_name": "Nom de la catégorie",
			"changed": "modifié",
			"check_again": "Vérifier à nouveau",
			"created": "Créé",
			"desktop_pet_companion": "Compagnon de bureau",
			"enable_mochi": "Activer Mochi",
			"enabling": "Activation…",
			"feat_briefing": "Briefings quotidiens et rappels de pause",
			"feat_chat": "Chat avec markdown, blocs de code et validation d'outils",
			"feat_pet": "Compagnon de bureau avec animations de marche, coup d'œil et humeur",
			"feat_screenshot": "Capture d'écran et contexte de page",
			"feat_subagent": "Sous-agents pour les tâches lourdes",
			"feat_watch": "Liste de surveillance — suis les changements de pages et de flux",
			"field_category": "Catégorie",
			"field_name": "Nom",
			"field_target": "Quoi surveiller",
			"landing_enable_hint": "Active Mochi pour voir le statut en direct, la liste de surveillance et le plan du jour. Le compagnon lui-même nécessite l'app de bureau {{productName}}.",
			"landing_starting": "Mochi est activé et démarre — statut en direct, liste de surveillance et plan du jour arrivent dans un instant.",
			"mark_seen": "Marquer comme vu",
			"mochi_is_sleeping": "Mochi dort",
			"mochi_logs_events_here_as_they_happen": "Mochi enregistre les événements ici au fur et à mesure",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "Mochi épingle les fichiers ici quand vous lui demandez d'en surveiller un",
			"mochi_s_plan": "Plan de Mochi",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi écrit un plan à son prochain réveil",
			"mood": "Humeur",
			"mood_change": "Humeur → {{value}}",
			"new_category": "Nouvelle catégorie…",
			"next": "Suivant",
			"next_check": "Prochaine : {{when}}",
			"no_activity_yet": "Aucune activité pour l'instant",
			"no_memories_yet": "Aucun souvenir pour l'instant",
			"no_pinned_files": "Aucun fichier épinglé",
			"no_plan_yet": "Aucun plan pour l'instant",
			"notes": "Notes",
			"nothing_being_watched": "Rien n'est surveillé",
			"page_range": "{{from}}–{{to}} sur {{total}}",
			"pinned_files": "Fichiers épinglés",
			"prev": "Précédent",
			"recent_activity": "Activité récente",
			"refresh": "Actualiser",
			"spend_time_with_mochi_to_build_memories": "Passez du temps avec Mochi pour créer des souvenirs",
			"status": "Statut",
			"stop_watching": "Arrêter la surveillance",
			"this_is_the_browser_view_everything_here_is_live": "Ceci est la vue navigateur. Tout ici est en direct, mais la fenêtre de l'animal\n            elle-même n'apparaît que dans l'application de bureau {{productName}}.",
			"top_moods": "Humeurs principales",
			"trigger": "Déclencheur",
			"url_or_what_to_watch": "URL ou quoi surveiller",
			"version": "Version",
			"watch": "Surveiller",
			"what_mochi_can_do": "Ce que Mochi peut faire",
			"what_to_call_it": "Comment l'appeler"
		},
		"mood": {
			"busy": "Occupé",
			"curious": "Curieux",
			"happy": "Content",
			"scared": "Effrayé",
			"sleepy": "Somnolent"
		},
		"pinned": {
			"empty_hint": "Demandez à {{name}} d'épingler les fichiers que vous voulez suivre",
			"unpin": "Désépingler"
		},
		"state": {
			"approval_pending": "Approbation en attente",
			"done": "Terminé",
			"error": "Erreur",
			"hiding": "Se cache",
			"idle": "Inactif",
			"listening": "À l'écoute",
			"offline": "Hors ligne",
			"peekThinking": "Coup d'œil & réflexion",
			"peeking": "Jette un œil",
			"thinking": "Réfléchit",
			"walking": "Marche",
			"working": "Travaille"
		},
		"stats": {
			"busiest_day_many": "Jour le plus bavard : {{date}} ({{n}} msgs)",
			"busiest_day_one": "Jour le plus bavard : {{date}} ({{n}} msg)",
			"busiest_day_other": "Jour le plus bavard : {{date}} ({{n}} msgs)",
			"companion_days": "Ensemble depuis {{time}}",
			"drags_many": "Déplacé {{n}} fois",
			"drags_one": "Déplacé {{n}} fois",
			"drags_other": "Déplacé {{n}} fois",
			"earliest_time": "Au plus tôt : debout à {{time}}",
			"first_use": "Votre histoire avec {{name}} vient de commencer",
			"latest_time": "Au plus tard : éveillé jusqu'à {{time}}",
			"longest_chat_many": "Discussion la plus longue : {{n}} messages",
			"longest_chat_one": "Discussion la plus longue : {{n}} message",
			"longest_chat_other": "Discussion la plus longue : {{n}} messages",
			"messages": "{{total}} messages ({{sent}} vous · {{received}} {{name}})",
			"mood_top": "Humeurs",
			"peeks_many": "A jeté un œil {{n}} fois",
			"peeks_one": "A jeté un œil {{n}} fois",
			"peeks_other": "A jeté un œil {{n}} fois",
			"screenshots_many": "A regardé ton écran {{n}} fois",
			"screenshots_one": "A regardé ton écran {{n}} fois",
			"screenshots_other": "A regardé ton écran {{n}} fois",
			"streak": "(série de {{streak}} jours)",
			"thinking_time": "A réfléchi pendant {{time}}",
			"title": "Souvenirs",
			"walks_many": "{{n}} pas",
			"walks_one": "{{n}} pas",
			"walks_other": "{{n}} pas"
		},
		"watchPanel": {
			"back": "Retour",
			"clear_cancel": "Les garder",
			"clear_completed": "Effacer tous les éléments terminés",
			"clear_confirm": "Effacer",
			"clear_confirm_desc_many": "Supprime {{count}} d’éléments terminés. Cette action est irréversible.",
			"clear_confirm_desc_one": "Supprime {{count}} élément terminé. Cette action est irréversible.",
			"clear_confirm_desc_other": "Supprime {{count}} éléments terminés. Cette action est irréversible.",
			"clear_confirm_title": "Effacer les éléments terminés ?",
			"clear_dismiss": "Fermer",
			"clear_failed": "Suppression impossible. Rien n’a été supprimé — réessayez.",
			"clear_working": "Suppression…",
			"close": "Fermer",
			"complete": "Terminer",
			"countdown": {
				"hours": "{{hours}} h {{mins}} min restantes",
				"mins": "{{mins}} min restantes"
			},
			"empty": "Aucun élément surveillé",
			"empty_hint": "Demandez à {{name}} de surveiller un prix, une livraison ou une page web",
			"field": {
				"check_count": "Nombre de vérifications",
				"history": "Historique",
				"interval": "Intervalle de vérification",
				"last_checked": "Dernière vérification",
				"last_result": "Dernier résultat",
				"next_check": "Prochaine vérification",
				"notes": "Notes",
				"priority": "Priorité",
				"target": "Cible",
				"trigger_at": "Heure de déclenchement"
			},
			"hide_completed": "Masquer les éléments terminés",
			"history": {
				"no_changes": "Aucun changement détecté pour l'instant",
				"show_all": "Tout afficher ({{count}})",
				"show_changes": "Changements uniquement"
			},
			"kind": {
				"custom": "Personnalisé",
				"meeting": "Rendez-vous",
				"reminder": "Rappel",
				"url": "Page web"
			},
			"older_completed": "Antérieurs",
			"overdue": "Vérification imminente",
			"priority": {
				"high": "Élevée",
				"low": "Basse",
				"normal": "Normale"
			},
			"recent_completed": "Terminés récemment",
			"reopen": "Rouvrir",
			"save": "Enregistrer",
			"show_completed": "Afficher les terminés ({{count}})",
			"status": {
				"cancelled": "Annulé",
				"done": "Terminé",
				"expired": "Expiré",
				"failed": "Échoué",
				"triggered": "Déclenché",
				"watching": "Surveillance"
			},
			"title": "Liste de surveillance"
		}
	} } },
	hi: { apps: /* @__PURE__ */ JSON.parse("{\"mochi\":{\"activity\":{\"type\":{\"budget\":\"बजट\",\"memory\":\"याद\",\"notification\":\"सूचना\",\"plan\":\"योजना\",\"presence\":\"उपस्थिति\",\"sleep\":\"नींद\",\"spawn\":\"एजेंट\",\"system\":\"सिस्टम\"}},\"instances\":{\"blurb\":\"Mochi एक ही पालतू है, और हर {{productName}} अपना चलाता है। चुनें कि यह किसका साथ दे — केवल अभी कनेक्टेड इंस्टेंस ही सूचीबद्ध हैं।\",\"connecting\":\"कनेक्ट हो रहा है…\",\"current\":\"वर्तमान\",\"desktop_only\":\"पेट कौन सा इंस्टेंस दिखाए, यह चुनने के लिए डेस्कटॉप ऐप ज़रूरी है।\",\"errored\":\"कनेक्शन समस्या\",\"feature_off\":\"मल्टी-इंस्टेंस बंद है। दूरस्थ इंस्टेंस चुनने के लिए इसे {{productName}} सेटिंग्स में चालू करें।\",\"host_disable_note\":\"किसी दूसरे इंस्टेंस पर Mochi बंद करने से केवल उस इंस्टेंस का अपना बैकग्राउंड काम रुकता है — तुम्हारा पेट यहाँ चुने गए इंस्टेंस पर ही रहता है।\",\"list_failed\":\"इंस्टेंस सूची पढ़ी नहीं जा सकी।\",\"loading\":\"इंस्टेंस खोजे जा रहे हैं…\",\"mochi_off\":\"वहाँ Mochi बंद है\",\"needs_restart\":\"मल्टी-इंस्टेंस अभी-अभी चालू हुआ — इसे सक्रिय करने के लिए gateway पुनः आरंभ करें।\",\"not_connected\":\"कनेक्ट नहीं\",\"switch_failed\":\"अभी इंस्टेंस बदला नहीं जा सका — तुम्हारा चुनाव सहेज लिया गया है और उस इंस्टेंस के जवाब देने पर लागू हो जाएगा।\",\"switch_note\":\"बदलने पर रूप और चैट इतिहास भी बदल जाते हैं — हर इंस्टेंस अपने रखता है। कोई सहेजा गया इंस्टेंस गायब हो जाए तो इस कंप्यूटर पर लौट आता है।\",\"this_computer\":\"यह कंप्यूटर\"},\"mochiPage\":{\"add_failed\":\"जोड़ नहीं सके — तुम्हारा इनपुट यहीं है, फिर कोशिश करो।\",\"add_something_above_or_ask_mochi_to_keep_an_eye\":\"ऊपर कुछ जोड़ें, या Mochi से किसी पेज पर नज़र रखने को कहें\",\"category_name\":\"श्रेणी का नाम\",\"changed\":\"बदला गया\",\"check_again\":\"फिर से जाँचें\",\"created\":\"बनाया गया\",\"desktop_pet_companion\":\"डेस्कटॉप पालतू साथी\",\"enable_mochi\":\"Mochi चालू करो\",\"enabling\":\"चालू हो रहा है…\",\"feat_briefing\":\"रोज़ की ब्रीफ़िंग और ब्रेक रिमाइंडर\",\"feat_chat\":\"मार्कडाउन, कोड ब्लॉक और टूल मंज़ूरी वाला चैट\",\"feat_pet\":\"चलने, झाँकने और मूड एनिमेशन वाला डेस्कटॉप पालतू\",\"feat_screenshot\":\"स्क्रीनशॉट कैप्चर और पेज कॉन्टेक्स्ट\",\"feat_subagent\":\"भारी कामों के लिए सबएजेंट भेजना\",\"feat_watch\":\"वॉच लिस्ट — पेज और फ़ीड के बदलाव ट्रैक करो\",\"field_category\":\"श्रेणी\",\"field_name\":\"नाम\",\"field_target\":\"किस पर नज़र रखनी है\",\"landing_enable_hint\":\"लाइव स्टेटस, वॉच लिस्ट और आज का प्लान देखने के लिए Mochi चालू करो। पालतू खुद के लिए {{productName}} डेस्कटॉप ऐप चाहिए।\",\"landing_starting\":\"Mochi चालू है और शुरू हो रहा है — लाइव स्टेटस, वॉच लिस्ट और आज का प्लान अभी दिखेगा।\",\"mark_seen\":\"देखा गया चिह्नित करें\",\"mochi_is_sleeping\":\"Mochi सो रहा है\",\"mochi_logs_events_here_as_they_happen\":\"Mochi घटनाओं को होते ही यहाँ लॉग करता है\",\"mochi_pins_files_here_when_you_ask_it_to_watch_o\":\"जब तुम Mochi से किसी फ़ाइल पर नज़र रखने को कहते हो, तो वह उसे यहाँ पिन कर देता है\",\"mochi_s_plan\":\"Mochi की योजना\",\"mochi_writes_a_plan_when_it_next_wakes_up\":\"Mochi अगली बार जागने पर एक योजना लिखता है\",\"mood\":\"मूड\",\"mood_change\":\"मिज़ाज → {{value}}\",\"new_category\":\"नई श्रेणी…\",\"next\":\"अगला\",\"next_check\":\"अगली: {{when}}\",\"no_activity_yet\":\"अभी तक कोई गतिविधि नहीं\",\"no_memories_yet\":\"अभी तक कोई याद नहीं\",\"no_pinned_files\":\"कोई पिन की गई फ़ाइल नहीं\",\"no_plan_yet\":\"अभी तक कोई योजना नहीं\",\"notes\":\"नोट्स\",\"nothing_being_watched\":\"कुछ भी निगरानी में नहीं\",\"page_range\":\"{{total}} में से {{from}}–{{to}}\",\"pinned_files\":\"पिन की गई फ़ाइलें\",\"prev\":\"पिछला\",\"recent_activity\":\"हाल की गतिविधि\",\"refresh\":\"रिफ़्रेश करें\",\"spend_time_with_mochi_to_build_memories\":\"यादें बनाने के लिए Mochi के साथ समय बिताएँ\",\"status\":\"स्थिति\",\"stop_watching\":\"निगरानी बंद करें\",\"this_is_the_browser_view_everything_here_is_live\":\"यह ब्राउज़र दृश्य है। यहाँ सब कुछ लाइव है, लेकिन पालतू विंडो\\n            स्वयं केवल {{productName}} डेस्कटॉप ऐप में दिखाई देती है।\",\"top_moods\":\"शीर्ष मूड\",\"trigger\":\"ट्रिगर\",\"url_or_what_to_watch\":\"URL या किस पर नज़र रखनी है\",\"version\":\"संस्करण\",\"watch\":\"नज़र रखें\",\"what_mochi_can_do\":\"Mochi क्या कर सकता है\",\"what_to_call_it\":\"इसे क्या नाम दें\"},\"mood\":{\"busy\":\"व्यस्त\",\"curious\":\"जिज्ञासु\",\"happy\":\"खुश\",\"scared\":\"डरा हुआ\",\"sleepy\":\"नींद में\"},\"pinned\":{\"empty_hint\":\"{{name}} से उन फ़ाइलों को पिन करने के लिए कहो जिन्हें तुम ट्रैक करना चाहते हो\",\"unpin\":\"अनपिन करें\"},\"state\":{\"approval_pending\":\"स्वीकृति लंबित\",\"done\":\"पूर्ण\",\"error\":\"त्रुटि\",\"hiding\":\"छिप रहा है\",\"idle\":\"निष्क्रिय\",\"listening\":\"सुन रहा है\",\"offline\":\"ऑफ़लाइन\",\"peekThinking\":\"झाँकें और सोचें\",\"peeking\":\"झाँक रहा है\",\"thinking\":\"सोच रहा है\",\"walking\":\"चल रहा है\",\"working\":\"काम कर रहा है\"},\"stats\":{\"busiest_day_one\":\"सबसे बातूनी दिन: {{date}} ({{n}} संदेश)\",\"busiest_day_other\":\"सबसे बातूनी दिन: {{date}} ({{n}} संदेश)\",\"companion_days\":\"{{time}} से साथ\",\"drags_one\":\"{{n}} बार खींचा गया\",\"drags_other\":\"{{n}} बार खींचा गया\",\"earliest_time\":\"सबसे जल्दी: {{time}} बजे जागा\",\"first_use\":\"{{name}} के साथ तुम्हारी कहानी अभी शुरू हुई\",\"latest_time\":\"सबसे देर: {{time}} तक जागता रहा\",\"longest_chat_one\":\"सबसे लंबी चैट: {{n}} संदेश\",\"longest_chat_other\":\"सबसे लंबी चैट: {{n}} संदेश\",\"messages\":\"{{total}} संदेश ({{sent}} तुम · {{received}} {{name}})\",\"mood_top\":\"मूड\",\"peeks_one\":\"{{n}} बार झाँका\",\"peeks_other\":\"{{n}} बार झाँका\",\"screenshots_one\":\"{{n}} बार तुम्हारी स्क्रीन देखी\",\"screenshots_other\":\"{{n}} बार तुम्हारी स्क्रीन देखी\",\"streak\":\"({{streak}} दिन की लगातार श्रृंखला)\",\"thinking_time\":\"{{time}} तक सोचा\",\"title\":\"यादें\",\"walks_one\":\"{{n}} कदम\",\"walks_other\":\"{{n}} कदम\"},\"watchPanel\":{\"back\":\"वापस\",\"clear_cancel\":\"रहने दो\",\"clear_completed\":\"सभी पूर्ण साफ़ करें\",\"clear_confirm\":\"हटाओ\",\"clear_confirm_desc_one\":\"{{count}} पूरा हुआ आइटम हट जाएगा। इसे वापस नहीं लाया जा सकता।\",\"clear_confirm_desc_other\":\"{{count}} पूरे हुए आइटम हट जाएंगे। इसे वापस नहीं लाया जा सकता।\",\"clear_confirm_title\":\"पूरे हुए हटा दें?\",\"clear_dismiss\":\"बंद करो\",\"clear_failed\":\"हटाया नहीं जा सका। कुछ भी नहीं हटा — फिर कोशिश करो।\",\"clear_working\":\"हटा रहे हैं…\",\"close\":\"बंद करें\",\"complete\":\"पूर्ण करें\",\"countdown\":{\"hours\":\"{{hours}} घं {{mins}} मि शेष\",\"mins\":\"{{mins}} मि शेष\"},\"empty\":\"कोई आइटम निगरानी में नहीं\",\"empty_hint\":\"{{name}} से किसी कीमत, किसी डिलीवरी या किसी वेब पेज पर नज़र रखने को कहें\",\"field\":{\"check_count\":\"जाँच संख्या\",\"history\":\"इतिहास\",\"interval\":\"जाँच अंतराल\",\"last_checked\":\"अंतिम जाँच\",\"last_result\":\"अंतिम परिणाम\",\"next_check\":\"अगली जाँच\",\"notes\":\"नोट्स\",\"priority\":\"प्राथमिकता\",\"target\":\"लक्ष्य\",\"trigger_at\":\"ट्रिगर समय\"},\"hide_completed\":\"पूर्ण छिपाएँ\",\"history\":{\"no_changes\":\"अभी तक कोई बदलाव नहीं मिला\",\"show_all\":\"सब दिखाएँ ({{count}})\",\"show_changes\":\"केवल बदलाव\"},\"kind\":{\"custom\":\"अपनी\",\"meeting\":\"मीटिंग\",\"reminder\":\"याद दिलाना\",\"url\":\"वेब पेज\"},\"older_completed\":\"पहले के\",\"overdue\":\"जल्द ही जाँच होगी\",\"priority\":{\"high\":\"उच्च\",\"low\":\"निम्न\",\"normal\":\"सामान्य\"},\"recent_completed\":\"हाल ही में पूर्ण\",\"reopen\":\"फिर से खोलें\",\"save\":\"सहेजें\",\"show_completed\":\"पूर्ण दिखाएँ ({{count}})\",\"status\":{\"cancelled\":\"रद्द\",\"done\":\"पूर्ण\",\"expired\":\"समाप्त\",\"failed\":\"विफल\",\"triggered\":\"ट्रिगर हुआ\",\"watching\":\"निगरानी में\"},\"title\":\"निगरानी सूची\"}}}") },
	it: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "Budget",
			"memory": "Memoria",
			"notification": "Notifica",
			"plan": "Piano",
			"presence": "Presenza",
			"sleep": "Sonno",
			"spawn": "Agente",
			"system": "Sistema"
		} },
		"instances": {
			"blurb": "Mochi è un solo animale, e ogni {{productName}} ha il suo. Scegli a chi fa compagnia — vengono elencate solo le istanze connesse in questo momento.",
			"connecting": "connessione…",
			"current": "attuale",
			"desktop_only": "Scegliere quale istanza mostra il pet richiede l'app desktop.",
			"errored": "problema di connessione",
			"feature_off": "La modalità multi-istanza è disattivata. Attivala nelle Impostazioni di {{productName}} per scegliere un'istanza remota.",
			"host_disable_note": "Disattivare Mochi su un'altra istanza interrompe solo il lavoro in background di quell'istanza: il tuo pet resta sull'istanza che scegli qui.",
			"list_failed": "Impossibile leggere l'elenco delle istanze.",
			"loading": "Ricerca di istanze…",
			"mochi_off": "Mochi è disattivato lì",
			"needs_restart": "La modalità multi-istanza è appena stata attivata — riavvia il gateway per attivarla.",
			"not_connected": "non connessa",
			"switch_failed": "Non è stato possibile cambiare istanza ora: la tua scelta è salvata e verrà applicata appena quell'istanza risponde.",
			"switch_note": "Cambiare istanza cambia anche aspetto e cronologia della chat — ogni istanza conserva i propri. Un'istanza salvata che scompare ricade su questo computer.",
			"this_computer": "Questo computer"
		},
		"mochiPage": {
			"add_failed": "Non è stato possibile aggiungerlo: il tuo testo è ancora qui, riprova.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "Aggiungi qualcosa sopra o chiedi a Mochi di tenere d'occhio una pagina",
			"category_name": "Nome della categoria",
			"changed": "modificato",
			"check_again": "Controlla di nuovo",
			"created": "Creato",
			"desktop_pet_companion": "Compagno da scrivania",
			"enable_mochi": "Attiva Mochi",
			"enabling": "Attivazione…",
			"feat_briefing": "Briefing quotidiani e promemoria per le pause",
			"feat_chat": "Chat con markdown, blocchi di codice e approvazione strumenti",
			"feat_pet": "Pet da desktop con animazioni di camminata, sbircio e umore",
			"feat_screenshot": "Cattura schermo e contesto della pagina",
			"feat_subagent": "Invio di subagent per i lavori pesanti",
			"feat_watch": "Lista di controllo — monitora pagine e feed",
			"field_category": "Categoria",
			"field_name": "Nome",
			"field_target": "Cosa monitorare",
			"landing_enable_hint": "Attiva Mochi per vedere stato dal vivo, lista di controllo e piano di oggi. Il pet richiede l'app desktop di {{productName}}.",
			"landing_starting": "Mochi è attivo e si sta avviando: stato dal vivo, lista di controllo e piano di oggi appaiono tra un istante.",
			"mark_seen": "Segna come visto",
			"mochi_is_sleeping": "Mochi sta dormendo",
			"mochi_logs_events_here_as_they_happen": "Mochi registra qui gli eventi man mano che accadono",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "Mochi fissa qui i file quando gli chiedi di monitorarne uno",
			"mochi_s_plan": "Piano di Mochi",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi scrive un piano al suo prossimo risveglio",
			"mood": "Umore",
			"mood_change": "Umore → {{value}}",
			"new_category": "Nuova categoria…",
			"next": "Avanti",
			"next_check": "Prossimo: {{when}}",
			"no_activity_yet": "Ancora nessuna attività",
			"no_memories_yet": "Ancora nessun ricordo",
			"no_pinned_files": "Nessun file fissato",
			"no_plan_yet": "Ancora nessun piano",
			"notes": "Note",
			"nothing_being_watched": "Nulla in monitoraggio",
			"page_range": "{{from}}–{{to}} di {{total}}",
			"pinned_files": "File fissati",
			"prev": "Precedente",
			"recent_activity": "Attività recente",
			"refresh": "Aggiorna",
			"spend_time_with_mochi_to_build_memories": "Passa del tempo con Mochi per creare ricordi",
			"status": "Stato",
			"stop_watching": "Interrompi il monitoraggio",
			"this_is_the_browser_view_everything_here_is_live": "Questa è la vista browser. Tutto qui è in tempo reale, ma la finestra dell'animale\n            stessa appare solo nell'app desktop di {{productName}}.",
			"top_moods": "Umori principali",
			"trigger": "Attivatore",
			"url_or_what_to_watch": "URL o cosa monitorare",
			"version": "Versione",
			"watch": "Monitora",
			"what_mochi_can_do": "Cosa può fare Mochi",
			"what_to_call_it": "Come chiamarlo"
		},
		"mood": {
			"busy": "Occupato",
			"curious": "Curioso",
			"happy": "Felice",
			"scared": "Spaventato",
			"sleepy": "Assonnato"
		},
		"pinned": {
			"empty_hint": "Chiedi a {{name}} di aggiungere i file che vuoi tenere d'occhio",
			"unpin": "Rimuovi"
		},
		"state": {
			"approval_pending": "Approvazione in sospeso",
			"done": "Fatto",
			"error": "Errore",
			"hiding": "Si nasconde",
			"idle": "Inattivo",
			"listening": "In ascolto",
			"offline": "Offline",
			"peekThinking": "Sbircia e pensa",
			"peeking": "Sbircia",
			"thinking": "Pensa",
			"walking": "Cammina",
			"working": "Lavora"
		},
		"stats": {
			"busiest_day_many": "Giorno più chiacchierone: {{date}} ({{n}} msg)",
			"busiest_day_one": "Giorno più chiacchierone: {{date}} ({{n}} msg)",
			"busiest_day_other": "Giorno più chiacchierone: {{date}} ({{n}} msg)",
			"companion_days": "Insieme da {{time}}",
			"drags_many": "Trascinato {{n}} volte",
			"drags_one": "Trascinato {{n}} volta",
			"drags_other": "Trascinato {{n}} volte",
			"earliest_time": "Il più presto: sveglio alle {{time}}",
			"first_use": "La tua storia con {{name}} è appena iniziata",
			"latest_time": "Il più tardi: sveglio fino alle {{time}}",
			"longest_chat_many": "Chat più lunga: {{n}} messaggi",
			"longest_chat_one": "Chat più lunga: {{n}} messaggio",
			"longest_chat_other": "Chat più lunga: {{n}} messaggi",
			"messages": "{{total}} messaggi ({{sent}} tu · {{received}} {{name}})",
			"mood_top": "Umori",
			"peeks_many": "Ha sbirciato {{n}} volte",
			"peeks_one": "Ha sbirciato {{n}} volta",
			"peeks_other": "Ha sbirciato {{n}} volte",
			"screenshots_many": "Ha guardato il tuo schermo {{n}} volte",
			"screenshots_one": "Ha guardato il tuo schermo {{n}} volta",
			"screenshots_other": "Ha guardato il tuo schermo {{n}} volte",
			"streak": "(serie di {{streak}} giorni)",
			"thinking_time": "Ha pensato per {{time}}",
			"title": "Ricordi",
			"walks_many": "{{n}} passi",
			"walks_one": "{{n}} passo",
			"walks_other": "{{n}} passi"
		},
		"watchPanel": {
			"back": "Indietro",
			"clear_cancel": "Tienili",
			"clear_completed": "Cancella tutti i completati",
			"clear_confirm": "Cancella",
			"clear_confirm_desc_many": "Elimina {{count}} di elementi completati. Non si può annullare.",
			"clear_confirm_desc_one": "Elimina {{count}} elemento completato. Non si può annullare.",
			"clear_confirm_desc_other": "Elimina {{count}} elementi completati. Non si può annullare.",
			"clear_confirm_title": "Cancellare i completati?",
			"clear_dismiss": "Chiudi",
			"clear_failed": "Cancellazione non riuscita. Non è stato eliminato nulla: riprova.",
			"clear_working": "Cancellazione…",
			"close": "Chiudi",
			"complete": "Completa",
			"countdown": {
				"hours": "{{hours}} h {{mins}} min rimasti",
				"mins": "{{mins}} min rimasti"
			},
			"empty": "Nessun elemento monitorato",
			"empty_hint": "Chiedi a {{name}} di tenere d'occhio un prezzo, una consegna o una pagina web",
			"field": {
				"check_count": "Numero di controlli",
				"history": "Cronologia",
				"interval": "Intervallo di controllo",
				"last_checked": "Ultimo controllo",
				"last_result": "Ultimo risultato",
				"next_check": "Prossimo controllo",
				"notes": "Note",
				"priority": "Priorità",
				"target": "Obiettivo",
				"trigger_at": "Ora di attivazione"
			},
			"hide_completed": "Nascondi completati",
			"history": {
				"no_changes": "Nessuna modifica rilevata finora",
				"show_all": "Mostra tutti ({{count}})",
				"show_changes": "Solo modifiche"
			},
			"kind": {
				"custom": "Personalizzata",
				"meeting": "Incontro",
				"reminder": "Promemoria",
				"url": "Pagina web"
			},
			"older_completed": "Precedenti",
			"overdue": "Controllo a breve",
			"priority": {
				"high": "Alta",
				"low": "Bassa",
				"normal": "Normale"
			},
			"recent_completed": "Completati di recente",
			"reopen": "Riapri",
			"save": "Salva",
			"show_completed": "Mostra completati ({{count}})",
			"status": {
				"cancelled": "Annullato",
				"done": "Fatto",
				"expired": "Scaduto",
				"failed": "Non riuscito",
				"triggered": "Attivato",
				"watching": "In monitoraggio"
			},
			"title": "Elenco di monitoraggio"
		}
	} } },
	ja: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "予算",
			"memory": "メモリ",
			"notification": "通知",
			"plan": "計画",
			"presence": "プレゼンス",
			"sleep": "スリープ",
			"spawn": "エージェント",
			"system": "システム"
		} },
		"instances": {
			"blurb": "Mochi は1つのペットであり、すべての {{productName}} が独自に実行されます。その相手を選んでください — 現在接続されているインスタンスのみがリストされます。",
			"connecting": "接続中…",
			"current": "現在",
			"desktop_only": "ペットがどのインスタンスを表示するかの選択にはデスクトップアプリが必要です。",
			"errored": "接続問題",
			"feature_off": "マルチインスタンスがオフです。{{productName}} 設定で有効にしてリモートインスタンスを選択してください。",
			"host_disable_note": "他のインスタンスで Mochi を無効にしても、そのインスタンス自身のバックグラウンド処理が止まるだけです。ペットはここで選んだインスタンスに残ります。",
			"list_failed": "インスタンスリストを読み込めませんでした。",
			"loading": "インスタンスを探しています…",
			"mochi_off": "そこで Mochi がオフです",
			"needs_restart": "マルチインスタンスが有効になったばかりです — ゲートウェイを再起動して有効にしてください。",
			"not_connected": "接続されていません",
			"switch_failed": "今はインスタンスを切り替えられませんでした。選択は保存されているので、そのインスタンスが応答したら適用されます。",
			"switch_note": "切り替えると外観とチャット履歴も切り替わります — 各インスタンスが独自に保持されます。保存されたインスタンスが失われた場合はこのコンピューターにフォールバックします。",
			"this_computer": "このコンピューター"
		},
		"mochiPage": {
			"add_failed": "追加できませんでした — 入力はまだここにあります。もう一度試してください。",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "上に何かを追加するか、Mochi にページを監視するよう頼んでください",
			"category_name": "カテゴリー名",
			"changed": "変更されました",
			"check_again": "もう一度確認",
			"created": "作成されました",
			"desktop_pet_companion": "デスクトップペットコンパニオン",
			"enable_mochi": "Mochi を有効にする",
			"enabling": "有効化中…",
			"feat_briefing": "毎日のブリーフィングと休憩リマインダー",
			"feat_chat": "Markdown、コードブロック、ツール承認でチャット",
			"feat_pet": "ウォーク、ピーク、気分アニメーション付きデスクトップペット",
			"feat_screenshot": "スクリーンショットキャプチャとページコンテキスト",
			"feat_subagent": "重いタスク用のサブエージェント作業",
			"feat_watch": "ウォッチリスト — ページとフィードの変更を追跡",
			"field_category": "カテゴリー",
			"field_name": "名前",
			"field_target": "監視対象",
			"landing_enable_hint": "Mochi を有効にしてライブステータス、ウォッチリスト、本日の計画を表示します。ペット自体は {{productName}} デスクトップアプリが必要です。",
			"landing_starting": "Mochi が有効になり起動しています — ライブステータス、ウォッチリスト、本日の計画が間もなく表示されます。",
			"mark_seen": "既読にする",
			"mochi_is_sleeping": "Mochi は寝ています",
			"mochi_logs_events_here_as_they_happen": "Mochiはイベントをリアルタイムでここに記録します",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "監視するようにリクエストすると、Mochiはファイルをここにピン留めします",
			"mochi_s_plan": "Mochiの計画",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochiは次に起動する時に計画を作成します",
			"mood": "気分",
			"mood_change": "気分 → {{value}}",
			"new_category": "新しいカテゴリー…",
			"next": "次へ",
			"next_check": "次: {{when}}",
			"no_activity_yet": "まだアクティビティがありません",
			"no_memories_yet": "まだ思い出がありません",
			"no_pinned_files": "ピン留めされたファイルはありません",
			"no_plan_yet": "まだ計画がありません",
			"notes": "メモ",
			"nothing_being_watched": "監視中のものはありません",
			"page_range": "{{from}}–{{to}} / {{total}}",
			"pinned_files": "ピン留めされたファイル",
			"prev": "前へ",
			"recent_activity": "最近のアクティビティ",
			"refresh": "更新",
			"spend_time_with_mochi_to_build_memories": "Mochiと時間を過ごして思い出を作りましょう",
			"status": "ステータス",
			"stop_watching": "監視を停止",
			"this_is_the_browser_view_everything_here_is_live": "これはブラウザー表示です。ここに表示される内容はすべてリアルタイムですが、ペットウィンドウ自体は {{productName}} デスクトップアプリにのみ表示されます。",
			"top_moods": "トップの気分",
			"trigger": "トリガー",
			"url_or_what_to_watch": "URLまたは監視対象",
			"version": "バージョン",
			"watch": "監視",
			"what_mochi_can_do": "Mochiができること",
			"what_to_call_it": "名前"
		},
		"mood": {
			"busy": "忙しい",
			"curious": "好奇心旺盛",
			"happy": "幸せ",
			"scared": "怖い",
			"sleepy": "眠い"
		},
		"pinned": {
			"empty_hint": "{{name}}にファイルをピン留めするよう依頼して、追跡したいファイルを指定してください",
			"unpin": "ピン留め解除"
		},
		"state": {
			"approval_pending": "承認待機中",
			"done": "完了",
			"error": "エラー",
			"hiding": "非表示",
			"idle": "アイドル",
			"listening": "リッスン中",
			"offline": "オフライン",
			"peekThinking": "ピーク＆思考",
			"peeking": "ピーク中",
			"thinking": "思考中",
			"walking": "歩行中",
			"working": "作業中"
		},
		"stats": {
			"busiest_day_other": "最多チャットの日：{{date}}（{{n}}件のメッセージ）",
			"companion_days": "{{time}}一緒にいます",
			"drags_other": "{{n}}回ドラッグしました",
			"earliest_time": "最早：{{time}}に起床",
			"first_use": "{{name}}とのストーリーが始まったばかり",
			"latest_time": "最遅：{{time}}まで起きていました",
			"longest_chat_other": "最長チャット：{{n}}件のメッセージ",
			"messages": "{{total}}件のメッセージ（{{sent}}件があなた · {{received}}件{{name}}）",
			"mood_top": "ムード",
			"peeks_other": "{{n}}回ピーク",
			"screenshots_other": "スクリーンを{{n}}回確認",
			"streak": "（{{streak}}日連続）",
			"thinking_time": "{{time}}考えました",
			"title": "思い出",
			"walks_other": "{{n}}ステップ"
		},
		"watchPanel": {
			"back": "戻る",
			"clear_cancel": "保持する",
			"clear_completed": "完了したものをすべてクリア",
			"clear_confirm": "クリア",
			"clear_confirm_desc_other": "完了した{{count}}個のアイテムを削除します。これは元に戻すことはできません。",
			"clear_confirm_title": "完了したものをクリアしますか？",
			"clear_dismiss": "閉じる",
			"clear_failed": "クリアできませんでした。何も削除されていません — もう一度試してください。",
			"clear_working": "クリア中…",
			"close": "閉じる",
			"complete": "完了",
			"countdown": {
				"hours": "{{hours}}時間{{mins}}分残り",
				"mins": "{{mins}}分残り"
			},
			"empty": "監視中のアイテムはありません",
			"empty_hint": "{{name}}に価格、配達、またはWebページを監視するよう依頼してください",
			"field": {
				"check_count": "確認回数",
				"history": "履歴",
				"interval": "確認間隔",
				"last_checked": "最終確認",
				"last_result": "最後の結果",
				"next_check": "次の確認",
				"notes": "メモ",
				"priority": "優先度",
				"target": "対象",
				"trigger_at": "トリガー時刻"
			},
			"hide_completed": "完了したものを非表示",
			"history": {
				"no_changes": "まだ変更は検出されていません",
				"show_all": "すべてを表示（{{count}}）",
				"show_changes": "変更のみ"
			},
			"kind": {
				"custom": "カスタム",
				"meeting": "ミーティング",
				"reminder": "リマインダー",
				"url": "Webページ"
			},
			"older_completed": "前",
			"overdue": "まもなく確認",
			"priority": {
				"high": "高",
				"low": "低",
				"normal": "通常"
			},
			"recent_completed": "最近完了",
			"reopen": "再度開く",
			"save": "保存",
			"show_completed": "完了したものを表示（{{count}}）",
			"status": {
				"cancelled": "キャンセル済み",
				"done": "完了",
				"expired": "期限切れ",
				"failed": "失敗",
				"triggered": "トリガー済み",
				"watching": "監視中"
			},
			"title": "ウォッチリスト"
		}
	} } },
	ko: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "예산",
			"memory": "메모리",
			"notification": "알림",
			"plan": "계획",
			"presence": "재실 상태",
			"sleep": "절전",
			"spawn": "에이전트",
			"system": "시스템"
		} },
		"instances": {
			"blurb": "Mochi는 한 마리이고, {{productName}}마다 자체 Mochi를 실행합니다. 누구와 함께할지 고르세요 — 지금 연결된 인스턴스만 표시됩니다.",
			"connecting": "연결 중…",
			"current": "현재",
			"desktop_only": "펫을 어느 인스턴스에 표시할지 고르려면 데스크톱 앱이 필요합니다.",
			"errored": "연결 문제",
			"feature_off": "다중 인스턴스가 꺼져 있습니다. 원격 인스턴스를 선택하려면 {{productName}} 설정에서 켜세요.",
			"host_disable_note": "다른 인스턴스에서 Mochi를 끄면 그 인스턴스의 백그라운드 작업만 멈춥니다 — 펫은 여기에서 고른 인스턴스에 남습니다.",
			"list_failed": "인스턴스 목록을 읽지 못했습니다.",
			"loading": "인스턴스를 찾는 중…",
			"mochi_off": "그곳에서는 Mochi가 꺼져 있습니다",
			"needs_restart": "다중 인스턴스를 방금 켰습니다 — 적용하려면 게이트웨이를 다시 시작하세요.",
			"not_connected": "연결되지 않음",
			"switch_failed": "지금은 인스턴스를 전환할 수 없었습니다 — 선택은 저장되었으며 해당 인스턴스가 응답하는 즉시 적용됩니다.",
			"switch_note": "전환하면 외형과 채팅 기록도 함께 바뀝니다 — 인스턴스마다 각자 보관합니다. 저장된 인스턴스가 사라지면 이 컴퓨터로 돌아갑니다.",
			"this_computer": "이 컴퓨터"
		},
		"mochiPage": {
			"add_failed": "추가하지 못했습니다 — 입력한 내용은 그대로 있으니 다시 시도하세요.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "위에서 항목을 추가하거나, Mochi에게 페이지를 지켜봐 달라고 하세요",
			"category_name": "카테고리 이름",
			"changed": "변경됨",
			"check_again": "다시 확인",
			"created": "생성됨",
			"desktop_pet_companion": "데스크톱 펫 친구",
			"enable_mochi": "Mochi 켜기",
			"enabling": "켜는 중…",
			"feat_briefing": "일일 브리핑과 휴식 알림",
			"feat_chat": "Markdown, 코드 블록, 도구 승인이 있는 채팅",
			"feat_pet": "걷기·엿보기·기분 애니메이션이 있는 데스크톱 펫",
			"feat_screenshot": "스크린샷 캡처와 페이지 컨텍스트",
			"feat_subagent": "무거운 작업을 서브에이전트로 실행",
			"feat_watch": "감시 목록 — 페이지와 피드의 변경을 추적",
			"field_category": "카테고리",
			"field_name": "이름",
			"field_target": "감시할 대상",
			"landing_enable_hint": "Mochi를 켜면 실시간 상태, 감시 목록, 오늘의 계획을 볼 수 있습니다. 펫 자체는 {{productName}} 데스크톱 앱이 필요합니다.",
			"landing_starting": "Mochi를 켜서 시작하는 중입니다 — 실시간 상태, 감시 목록, 오늘의 계획이 곧 표시됩니다.",
			"mark_seen": "확인함으로 표시",
			"mochi_is_sleeping": "Mochi가 자고 있습니다",
			"mochi_logs_events_here_as_they_happen": "Mochi가 이벤트를 발생하는 대로 여기에 기록합니다",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "파일을 지켜봐 달라고 하면 Mochi가 여기에 고정합니다",
			"mochi_s_plan": "Mochi의 계획",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi가 다음에 깨어날 때 계획을 작성합니다",
			"mood": "기분",
			"mood_change": "기분 → {{value}}",
			"new_category": "새 카테고리…",
			"next": "다음",
			"next_check": "다음: {{when}}",
			"no_activity_yet": "활동 없음",
			"no_memories_yet": "추억 없음",
			"no_pinned_files": "고정된 파일 없음",
			"no_plan_yet": "계획 없음",
			"notes": "메모",
			"nothing_being_watched": "감시 중인 항목 없음",
			"page_range": "{{from}}–{{to}} / 전체 {{total}}",
			"pinned_files": "고정된 파일",
			"prev": "이전",
			"recent_activity": "최근 활동",
			"refresh": "새로 고침",
			"spend_time_with_mochi_to_build_memories": "Mochi와 시간을 보내며 추억을 쌓아 보세요",
			"status": "상태",
			"stop_watching": "감시 중지",
			"this_is_the_browser_view_everything_here_is_live": "브라우저 화면입니다. 여기 있는 내용은 모두 실시간이지만, 펫 창\n 자체는 {{productName}} 데스크톱 앱에서만 나타납니다.",
			"top_moods": "주요 기분",
			"trigger": "트리거",
			"url_or_what_to_watch": "URL 또는 감시할 대상",
			"version": "버전",
			"watch": "감시",
			"what_mochi_can_do": "Mochi가 할 수 있는 일",
			"what_to_call_it": "부를 이름"
		},
		"mood": {
			"busy": "바쁨",
			"curious": "호기심",
			"happy": "행복",
			"scared": "겁먹음",
			"sleepy": "졸림"
		},
		"pinned": {
			"empty_hint": "추적하고 싶은 파일을 {{name}}에게 고정해 달라고 하세요",
			"unpin": "고정 해제"
		},
		"state": {
			"approval_pending": "승인 대기 중",
			"done": "완료",
			"error": "오류",
			"hiding": "숨는 중",
			"idle": "대기",
			"listening": "듣는 중",
			"offline": "오프라인",
			"peekThinking": "엿보며 생각 중",
			"peeking": "엿보는 중",
			"thinking": "생각 중",
			"walking": "걷는 중",
			"working": "작업 중"
		},
		"stats": {
			"busiest_day_other": "가장 많이 대화한 날: {{date}} (메시지 {{n}}개)",
			"companion_days": "함께한 시간 {{time}}",
			"drags_other": "{{n}}번 끌었습니다",
			"earliest_time": "가장 이른 시각: {{time}}에 기상",
			"first_use": "{{name}}과(와)의 이야기가 막 시작되었습니다",
			"latest_time": "가장 늦은 시각: {{time}}까지 깨어 있었습니다",
			"longest_chat_other": "가장 긴 대화: 메시지 {{n}}개",
			"messages": "메시지 {{total}}개 ({{sent}}개 나 · {{received}}개 {{name}})",
			"mood_top": "기분",
			"peeks_other": "{{n}}번 엿봤습니다",
			"screenshots_other": "화면을 {{n}}번 봤습니다",
			"streak": "({{streak}}일 연속)",
			"thinking_time": "{{time}} 동안 생각했습니다",
			"title": "추억",
			"walks_other": "{{n}}걸음"
		},
		"watchPanel": {
			"back": "뒤로",
			"clear_cancel": "그대로 두기",
			"clear_completed": "완료된 항목 모두 지우기",
			"clear_confirm": "지우기",
			"clear_confirm_desc_other": "완료된 항목 {{count}}개를 삭제합니다. 되돌릴 수 없습니다.",
			"clear_confirm_title": "완료된 항목을 지우시겠습니까?",
			"clear_dismiss": "닫기",
			"clear_failed": "지우지 못했습니다. 삭제된 항목은 없습니다 — 다시 시도하세요.",
			"clear_working": "지우는 중…",
			"close": "닫기",
			"complete": "완료",
			"countdown": {
				"hours": "{{hours}}시간 {{mins}}분 남음",
				"mins": "{{mins}}분 남음"
			},
			"empty": "감시 중인 항목 없음",
			"empty_hint": "{{name}}에게 가격, 배송, 웹 페이지를 지켜봐 달라고 하세요",
			"field": {
				"check_count": "확인 횟수",
				"history": "기록",
				"interval": "확인 간격",
				"last_checked": "마지막 확인",
				"last_result": "마지막 결과",
				"next_check": "다음 확인",
				"notes": "메모",
				"priority": "우선순위",
				"target": "대상",
				"trigger_at": "트리거 시각"
			},
			"hide_completed": "완료된 항목 숨기기",
			"history": {
				"no_changes": "아직 감지된 변경 없음",
				"show_all": "모두 보기 ({{count}})",
				"show_changes": "변경만"
			},
			"kind": {
				"custom": "사용자 지정",
				"meeting": "회의",
				"reminder": "리마인더",
				"url": "웹 페이지"
			},
			"older_completed": "이전",
			"overdue": "곧 확인",
			"priority": {
				"high": "높음",
				"low": "낮음",
				"normal": "보통"
			},
			"recent_completed": "최근 완료",
			"reopen": "다시 열기",
			"save": "저장",
			"show_completed": "완료된 항목 보기 ({{count}})",
			"status": {
				"cancelled": "취소됨",
				"done": "완료",
				"expired": "만료됨",
				"failed": "실패",
				"triggered": "트리거됨",
				"watching": "감시 중"
			},
			"title": "감시 목록"
		}
	} } },
	pt: { apps: { "mochi": {
		"activity": { "type": {
			"budget": "Orçamento",
			"memory": "Memória",
			"notification": "Aviso",
			"plan": "Plano",
			"presence": "Presença",
			"sleep": "Sono",
			"spawn": "Agente",
			"system": "Sistema"
		} },
		"instances": {
			"blurb": "O Mochi é um único pet, e cada {{productName}} tem o seu. Escolha a quem ele faz companhia — só as instâncias conectadas agora são listadas.",
			"connecting": "conectando…",
			"current": "atual",
			"desktop_only": "Escolher qual instância o bichinho mostra requer o aplicativo de desktop.",
			"errored": "problema de conexão",
			"feature_off": "O modo multi-instância está desativado. Ative-o nas Configurações do {{productName}} para escolher uma instância remota.",
			"host_disable_note": "Desativar o Mochi em outra instância apenas interrompe o trabalho em segundo plano dessa instância — seu bichinho continua na instância que você escolher aqui.",
			"list_failed": "Não foi possível ler a lista de instâncias.",
			"loading": "Procurando instâncias…",
			"mochi_off": "O Mochi está desativado ali",
			"needs_restart": "O modo multi-instância acabou de ser ativado — reinicie o gateway para ativá-lo.",
			"not_connected": "não conectada",
			"switch_failed": "Não foi possível trocar de instância agora — sua escolha foi salva e será aplicada assim que essa instância responder.",
			"switch_note": "Trocar também troca a aparência e o histórico do chat — cada instância mantém os seus. Uma instância salva que desaparece recorre a este computador.",
			"this_computer": "Este computador"
		},
		"mochiPage": {
			"add_failed": "Não foi possível adicionar — seu texto continua aqui, tente de novo.",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "Adicione algo acima ou peça ao Mochi para ficar de olho em uma página",
			"category_name": "Nome da categoria",
			"changed": "alterado",
			"check_again": "Verificar novamente",
			"created": "Criado",
			"desktop_pet_companion": "Companheiro de desktop",
			"enable_mochi": "Ativar o Mochi",
			"enabling": "Ativando…",
			"feat_briefing": "Resumos diários e lembretes de pausa",
			"feat_chat": "Chat com markdown, blocos de código e aprovação de ferramentas",
			"feat_pet": "Bichinho de desktop com animações de andar, espiar e humor",
			"feat_screenshot": "Captura de tela e contexto da página",
			"feat_subagent": "Envio de subagentes para tarefas pesadas",
			"feat_watch": "Lista de observação — acompanhe mudanças em páginas e feeds",
			"field_category": "Categoria",
			"field_name": "Nome",
			"field_target": "O que observar",
			"landing_enable_hint": "Ative o Mochi para ver status ao vivo, lista de observação e o plano de hoje. O bichinho em si precisa do app de desktop do {{productName}}.",
			"landing_starting": "O Mochi está ativado e iniciando — status ao vivo, lista de observação e o plano de hoje aparecem em instantes.",
			"mark_seen": "Marcar como visto",
			"mochi_is_sleeping": "Mochi está dormindo",
			"mochi_logs_events_here_as_they_happen": "O Mochi registra os eventos aqui conforme acontecem",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "O Mochi fixa os arquivos aqui quando você pede para ele acompanhar um",
			"mochi_s_plan": "Plano do Mochi",
			"mochi_writes_a_plan_when_it_next_wakes_up": "O Mochi escreve um plano no próximo despertar",
			"mood": "Humor",
			"mood_change": "Humor → {{value}}",
			"new_category": "Nova categoria…",
			"next": "Próximo",
			"next_check": "Próxima: {{when}}",
			"no_activity_yet": "Ainda sem atividade",
			"no_memories_yet": "Ainda sem memórias",
			"no_pinned_files": "Nenhum arquivo fixado",
			"no_plan_yet": "Ainda sem plano",
			"notes": "Notas",
			"nothing_being_watched": "Nada sendo acompanhado",
			"page_range": "{{from}}–{{to}} de {{total}}",
			"pinned_files": "Arquivos fixados",
			"prev": "Anterior",
			"recent_activity": "Atividade recente",
			"refresh": "Atualizar",
			"spend_time_with_mochi_to_build_memories": "Passe tempo com o Mochi para criar memórias",
			"status": "Status",
			"stop_watching": "Parar de acompanhar",
			"this_is_the_browser_view_everything_here_is_live": "Esta é a visualização do navegador. Tudo aqui é ao vivo, mas a janela do pet\n            em si só aparece no aplicativo de desktop do {{productName}}.",
			"top_moods": "Principais humores",
			"trigger": "Gatilho",
			"url_or_what_to_watch": "URL ou o que acompanhar",
			"version": "Versão",
			"watch": "Acompanhar",
			"what_mochi_can_do": "O que o Mochi pode fazer",
			"what_to_call_it": "Como chamá-lo"
		},
		"mood": {
			"busy": "Ocupado",
			"curious": "Curioso",
			"happy": "Feliz",
			"scared": "Assustado",
			"sleepy": "Sonolento"
		},
		"pinned": {
			"empty_hint": "Peça ao {{name}} para fixar os arquivos que você quer acompanhar",
			"unpin": "Desafixar"
		},
		"state": {
			"approval_pending": "Aprovação pendente",
			"done": "Concluído",
			"error": "Erro",
			"hiding": "Escondendo-se",
			"idle": "Inativo",
			"listening": "Ouvindo",
			"offline": "Off-line",
			"peekThinking": "Espiar e pensar",
			"peeking": "Espiando",
			"thinking": "Pensando",
			"walking": "Andando",
			"working": "Trabalhando"
		},
		"stats": {
			"busiest_day_many": "Dia mais tagarela: {{date}} ({{n}} msgs)",
			"busiest_day_one": "Dia mais tagarela: {{date}} ({{n}} msg)",
			"busiest_day_other": "Dia mais tagarela: {{date}} ({{n}} msgs)",
			"companion_days": "Juntos há {{time}}",
			"drags_many": "Arrastado {{n}} vezes",
			"drags_one": "Arrastado {{n}} vez",
			"drags_other": "Arrastado {{n}} vezes",
			"earliest_time": "Mais cedo: acordado às {{time}}",
			"first_use": "Sua história com {{name}} acabou de começar",
			"latest_time": "Mais tarde: acordado até às {{time}}",
			"longest_chat_many": "Conversa mais longa: {{n}} mensagens",
			"longest_chat_one": "Conversa mais longa: {{n}} mensagem",
			"longest_chat_other": "Conversa mais longa: {{n}} mensagens",
			"messages": "{{total}} mensagens ({{sent}} você · {{received}} {{name}})",
			"mood_top": "Humores",
			"peeks_many": "Espiou {{n}} vezes",
			"peeks_one": "Espiou {{n}} vez",
			"peeks_other": "Espiou {{n}} vezes",
			"screenshots_many": "Olhou sua tela {{n}} vezes",
			"screenshots_one": "Olhou sua tela {{n}} vez",
			"screenshots_other": "Olhou sua tela {{n}} vezes",
			"streak": "(sequência de {{streak}} dias)",
			"thinking_time": "Pensou por {{time}}",
			"title": "Memórias",
			"walks_many": "{{n}} passos",
			"walks_one": "{{n}} passo",
			"walks_other": "{{n}} passos"
		},
		"watchPanel": {
			"back": "Voltar",
			"clear_cancel": "Manter",
			"clear_completed": "Limpar todos os concluídos",
			"clear_confirm": "Limpar",
			"clear_confirm_desc_many": "Exclui {{count}} de itens concluídos. Isso não pode ser desfeito.",
			"clear_confirm_desc_one": "Exclui {{count}} item concluído. Isso não pode ser desfeito.",
			"clear_confirm_desc_other": "Exclui {{count}} itens concluídos. Isso não pode ser desfeito.",
			"clear_confirm_title": "Limpar os concluídos?",
			"clear_dismiss": "Fechar",
			"clear_failed": "Não foi possível limpar. Nada foi excluído — tente de novo.",
			"clear_working": "Limpando…",
			"close": "Fechar",
			"complete": "Concluir",
			"countdown": {
				"hours": "faltam {{hours}}h {{mins}}min",
				"mins": "faltam {{mins}}min"
			},
			"empty": "Nenhum item sendo acompanhado",
			"empty_hint": "Peça ao {{name}} para acompanhar um preço, uma entrega ou uma página web",
			"field": {
				"check_count": "Número de verificações",
				"history": "Histórico",
				"interval": "Intervalo de verificação",
				"last_checked": "Última verificação",
				"last_result": "Último resultado",
				"next_check": "Próxima verificação",
				"notes": "Notas",
				"priority": "Prioridade",
				"target": "Alvo",
				"trigger_at": "Horário do disparo"
			},
			"hide_completed": "Ocultar concluídos",
			"history": {
				"no_changes": "Nenhuma mudança detectada ainda",
				"show_all": "Mostrar tudo ({{count}})",
				"show_changes": "Somente mudanças"
			},
			"kind": {
				"custom": "Personalizada",
				"meeting": "Reunião",
				"reminder": "Lembrete",
				"url": "Página web"
			},
			"older_completed": "Anteriores",
			"overdue": "Verificando em breve",
			"priority": {
				"high": "Alta",
				"low": "Baixa",
				"normal": "Normal"
			},
			"recent_completed": "Concluídos recentemente",
			"reopen": "Reabrir",
			"save": "Salvar",
			"show_completed": "Mostrar concluídos ({{count}})",
			"status": {
				"cancelled": "Cancelado",
				"done": "Concluído",
				"expired": "Expirado",
				"failed": "Falhou",
				"triggered": "Disparado",
				"watching": "Acompanhando"
			},
			"title": "Lista de acompanhamento"
		}
	} } },
	ru: { apps: /* @__PURE__ */ JSON.parse("{\"mochi\":{\"activity\":{\"type\":{\"budget\":\"Бюджет\",\"memory\":\"Память\",\"notification\":\"Уведомление\",\"plan\":\"План\",\"presence\":\"Присутствие\",\"sleep\":\"Сон\",\"spawn\":\"Агент\",\"system\":\"Система\"}},\"instances\":{\"blurb\":\"Mochi — один питомец, и у каждого {{productName}} свой. Выберите, кому он составит компанию — показаны только подключённые сейчас экземпляры.\",\"connecting\":\"подключение…\",\"current\":\"текущий\",\"desktop_only\":\"Выбор экземпляра, который показывает питомец, требует настольного приложения.\",\"errored\":\"проблема с подключением\",\"feature_off\":\"Режим нескольких экземпляров отключён. Включите его в настройках {{productName}}, чтобы выбрать удалённый экземпляр.\",\"host_disable_note\":\"Отключение Mochi на другом экземпляре останавливает только фоновую работу этого экземпляра — питомец остаётся на экземпляре, который вы выбрали здесь.\",\"list_failed\":\"Не удалось прочитать список экземпляров.\",\"loading\":\"Поиск экземпляров…\",\"mochi_off\":\"Mochi там отключён\",\"needs_restart\":\"Режим нескольких экземпляров только что включён — перезапустите gateway, чтобы активировать его.\",\"not_connected\":\"не подключён\",\"switch_failed\":\"Сейчас не удалось сменить экземпляр — ваш выбор сохранён и применится, как только этот экземпляр ответит.\",\"switch_note\":\"Переключение также меняет внешний вид и историю чата — у каждого экземпляра свои. Сохранённый экземпляр, который исчезает, возвращается к этому компьютеру.\",\"this_computer\":\"Этот компьютер\"},\"mochiPage\":{\"add_failed\":\"Не удалось добавить — введённое сохранено, попробуйте снова.\",\"add_something_above_or_ask_mochi_to_keep_an_eye\":\"Добавьте что-нибудь выше или попросите Mochi следить за страницей\",\"category_name\":\"Название категории\",\"changed\":\"изменено\",\"check_again\":\"Проверить снова\",\"created\":\"Создано\",\"desktop_pet_companion\":\"Настольный питомец-компаньон\",\"enable_mochi\":\"Включить Mochi\",\"enabling\":\"Включение…\",\"feat_briefing\":\"Ежедневные сводки и напоминания о перерывах\",\"feat_chat\":\"Чат с markdown, блоками кода и подтверждением инструментов\",\"feat_pet\":\"Настольный питомец с анимациями ходьбы, выглядывания и настроения\",\"feat_screenshot\":\"Снимки экрана и контекст страницы\",\"feat_subagent\":\"Отправка субагентов на тяжёлые задачи\",\"feat_watch\":\"Список наблюдения — следите за изменениями страниц и лент\",\"field_category\":\"Категория\",\"field_name\":\"Название\",\"field_target\":\"За чем следить\",\"landing_enable_hint\":\"Включите Mochi, чтобы видеть статус, список наблюдения и план на сегодня. Самому питомцу нужно настольное приложение {{productName}}.\",\"landing_starting\":\"Mochi включён и запускается — статус в реальном времени, список наблюдения и план на сегодня появятся через мгновение.\",\"mark_seen\":\"Отметить как просмотренное\",\"mochi_is_sleeping\":\"Mochi спит\",\"mochi_logs_events_here_as_they_happen\":\"Mochi записывает события здесь по мере их наступления\",\"mochi_pins_files_here_when_you_ask_it_to_watch_o\":\"Mochi закрепляет файлы здесь, когда вы просите его следить за одним\",\"mochi_s_plan\":\"План Mochi\",\"mochi_writes_a_plan_when_it_next_wakes_up\":\"Mochi напишет план, когда в следующий раз проснётся\",\"mood\":\"Настроение\",\"mood_change\":\"Настроение → {{value}}\",\"new_category\":\"Новая категория…\",\"next\":\"Далее\",\"next_check\":\"Следующая: {{when}}\",\"no_activity_yet\":\"Пока нет активности\",\"no_memories_yet\":\"Пока нет воспоминаний\",\"no_pinned_files\":\"Нет закреплённых файлов\",\"no_plan_yet\":\"Пока нет плана\",\"notes\":\"Заметки\",\"nothing_being_watched\":\"Ничего не отслеживается\",\"page_range\":\"{{from}}–{{to}} из {{total}}\",\"pinned_files\":\"Закреплённые файлы\",\"prev\":\"Назад\",\"recent_activity\":\"Недавняя активность\",\"refresh\":\"Обновить\",\"spend_time_with_mochi_to_build_memories\":\"Проводите время с Mochi, чтобы накопить воспоминания\",\"status\":\"Статус\",\"stop_watching\":\"Прекратить наблюдение\",\"this_is_the_browser_view_everything_here_is_live\":\"Это просмотр в браузере. Здесь всё в реальном времени, но само окно питомца\\n            появляется только в настольном приложении {{productName}}.\",\"top_moods\":\"Основные настроения\",\"trigger\":\"Триггер\",\"url_or_what_to_watch\":\"URL или за чем следить\",\"version\":\"Версия\",\"watch\":\"Следить\",\"what_mochi_can_do\":\"Что умеет Mochi\",\"what_to_call_it\":\"Как его назвать\"},\"mood\":{\"busy\":\"Занят\",\"curious\":\"Любопытный\",\"happy\":\"Счастливый\",\"scared\":\"Испуганный\",\"sleepy\":\"Сонный\"},\"pinned\":{\"empty_hint\":\"Попросите {{name}} закрепить файлы, за которыми вы хотите следить\",\"unpin\":\"Открепить\"},\"state\":{\"approval_pending\":\"Ожидает одобрения\",\"done\":\"Готово\",\"error\":\"Ошибка\",\"hiding\":\"Прячется\",\"idle\":\"Ожидание\",\"listening\":\"Слушает\",\"offline\":\"Не в сети\",\"peekThinking\":\"Выглянуть и подумать\",\"peeking\":\"Выглядывает\",\"thinking\":\"Думает\",\"walking\":\"Идёт\",\"working\":\"Работает\"},\"stats\":{\"busiest_day_few\":\"Самый болтливый день: {{date}} ({{n}} сообщ.)\",\"busiest_day_many\":\"Самый болтливый день: {{date}} ({{n}} сообщ.)\",\"busiest_day_one\":\"Самый болтливый день: {{date}} ({{n}} сообщ.)\",\"busiest_day_other\":\"Самый болтливый день: {{date}} ({{n}} сообщ.)\",\"companion_days\":\"Вместе уже {{time}}\",\"drags_few\":\"Перетащен {{n}} раза\",\"drags_many\":\"Перетащен {{n}} раз\",\"drags_one\":\"Перетащен {{n}} раз\",\"drags_other\":\"Перетащен {{n}} раза\",\"earliest_time\":\"Раньше всего: проснулся в {{time}}\",\"first_use\":\"Ваша история с {{name}} только началась\",\"latest_time\":\"Позже всего: не спал до {{time}}\",\"longest_chat_few\":\"Самый долгий чат: {{n}} сообщения\",\"longest_chat_many\":\"Самый долгий чат: {{n}} сообщений\",\"longest_chat_one\":\"Самый долгий чат: {{n}} сообщение\",\"longest_chat_other\":\"Самый долгий чат: {{n}} сообщения\",\"messages\":\"{{total}} сообщений ({{sent}} вы · {{received}} {{name}})\",\"mood_top\":\"Настроения\",\"peeks_few\":\"Выглянул {{n}} раза\",\"peeks_many\":\"Выглянул {{n}} раз\",\"peeks_one\":\"Выглянул {{n}} раз\",\"peeks_other\":\"Выглянул {{n}} раза\",\"screenshots_few\":\"Смотрел на твой экран {{n}} раза\",\"screenshots_many\":\"Смотрел на твой экран {{n}} раз\",\"screenshots_one\":\"Смотрел на твой экран {{n}} раз\",\"screenshots_other\":\"Смотрел на твой экран {{n}} раза\",\"streak\":\"(серия {{streak}} дней)\",\"thinking_time\":\"Думал {{time}}\",\"title\":\"Воспоминания\",\"walks_few\":\"{{n}} шага\",\"walks_many\":\"{{n}} шагов\",\"walks_one\":\"{{n}} шаг\",\"walks_other\":\"{{n}} шага\"},\"watchPanel\":{\"back\":\"Назад\",\"clear_cancel\":\"Оставить\",\"clear_completed\":\"Очистить все завершённые\",\"clear_confirm\":\"Удалить\",\"clear_confirm_desc_few\":\"Будут удалены {{count}} завершённые записи. Отменить это нельзя.\",\"clear_confirm_desc_many\":\"Будет удалено {{count}} завершённых записей. Отменить это нельзя.\",\"clear_confirm_desc_one\":\"Будет удалена {{count}} завершённая запись. Отменить это нельзя.\",\"clear_confirm_desc_other\":\"Будет удалено {{count}} завершённой записи. Отменить это нельзя.\",\"clear_confirm_title\":\"Удалить завершённые?\",\"clear_dismiss\":\"Закрыть\",\"clear_failed\":\"Не удалось удалить. Ничего не удалено — попробуйте снова.\",\"clear_working\":\"Удаление…\",\"close\":\"Закрыть\",\"complete\":\"Завершить\",\"countdown\":{\"hours\":\"осталось {{hours}} ч {{mins}} мин\",\"mins\":\"осталось {{mins}} мин\"},\"empty\":\"Нет отслеживаемых элементов\",\"empty_hint\":\"Попросите {{name}} следить за ценой, доставкой или веб-страницей\",\"field\":{\"check_count\":\"Число проверок\",\"history\":\"История\",\"interval\":\"Интервал проверки\",\"last_checked\":\"Последняя проверка\",\"last_result\":\"Последний результат\",\"next_check\":\"Следующая проверка\",\"notes\":\"Заметки\",\"priority\":\"Приоритет\",\"target\":\"Цель\",\"trigger_at\":\"Время срабатывания\"},\"hide_completed\":\"Скрыть завершённые\",\"history\":{\"no_changes\":\"Изменений пока не обнаружено\",\"show_all\":\"Показать все ({{count}})\",\"show_changes\":\"Только изменения\"},\"kind\":{\"custom\":\"Своя\",\"meeting\":\"Встреча\",\"reminder\":\"Напоминание\",\"url\":\"Веб-страница\"},\"older_completed\":\"Ранее\",\"overdue\":\"Скоро проверка\",\"priority\":{\"high\":\"Высокий\",\"low\":\"Низкий\",\"normal\":\"Обычный\"},\"recent_completed\":\"Недавно завершённые\",\"reopen\":\"Открыть снова\",\"save\":\"Сохранить\",\"show_completed\":\"Показать завершённые ({{count}})\",\"status\":{\"cancelled\":\"Отменено\",\"done\":\"Готово\",\"expired\":\"Истекло\",\"failed\":\"Не удалось\",\"triggered\":\"Сработало\",\"watching\":\"Наблюдение\"},\"title\":\"Список наблюдения\"}}}") },
	"zh-CN": { apps: { "mochi": {
		"activity": { "type": {
			"budget": "预算",
			"memory": "记忆",
			"notification": "通知",
			"plan": "计划",
			"presence": "在场",
			"sleep": "睡眠",
			"spawn": "代理",
			"system": "系统"
		} },
		"instances": {
			"blurb": "Mochi 只有一只，而每个 {{productName}} 都各自跑着一个。选一个让它去陪 —— 列表只显示当前已连接的实例。",
			"connecting": "正在连接…",
			"current": "当前",
			"desktop_only": "选择宠物显示哪个实例需要桌面应用。",
			"errored": "连接有问题",
			"feature_off": "多实例功能未开启。在 {{productName}} 设置里启用后才能选择远端实例。",
			"host_disable_note": "在其他实例上关闭 Mochi 只会停掉该实例自己的后台工作 —— 宠物会留在你这里选中的实例上。",
			"list_failed": "无法读取实例列表。",
			"loading": "正在查找实例…",
			"mochi_off": "那边的 Mochi 已关闭",
			"needs_restart": "多实例刚刚开启 —— 重启 gateway 后生效。",
			"not_connected": "未连接",
			"switch_failed": "暂时无法切换实例 —— 你的选择已保存，等该实例响应后就会生效。",
			"switch_note": "切换同时会换外观和聊天记录 —— 每个实例各有一份。选中的实例消失时会自动退回本机。",
			"this_computer": "本机"
		},
		"mochiPage": {
			"add_failed": "添加失败——你的输入还在，请重试。",
			"add_something_above_or_ask_mochi_to_keep_an_eye": "在上方添加内容，或让 Mochi 帮你留意某个页面",
			"category_name": "分类名称",
			"changed": "已更改",
			"check_again": "再次检查",
			"created": "已创建",
			"desktop_pet_companion": "桌面宠物伙伴",
			"enable_mochi": "启用 Mochi",
			"enabling": "正在启用…",
			"feat_briefing": "每日简报与休息提醒",
			"feat_chat": "聊天支持 Markdown、代码块和工具审批",
			"feat_pet": "桌面宠物，带走动、张望和情绪动画",
			"feat_screenshot": "截图捕捉与页面上下文",
			"feat_subagent": "把重活派给子 agent",
			"feat_watch": "监视列表——追踪网页和信息源的变化",
			"field_category": "分类",
			"field_name": "名称",
			"field_target": "监视对象",
			"landing_enable_hint": "启用 Mochi 即可查看实况状态、监视列表和今天的计划。宠物本体需要 {{productName}} 桌面端。",
			"landing_starting": "Mochi 已启用，正在启动——实况状态、监视列表和今天的计划稍后出现。",
			"mark_seen": "标为已读",
			"mochi_is_sleeping": "Mochi 正在睡觉",
			"mochi_logs_events_here_as_they_happen": "Mochi 会在事件发生时记录在这里",
			"mochi_pins_files_here_when_you_ask_it_to_watch_o": "当你让 Mochi 监视某个文件时，它会把文件置顶在这里",
			"mochi_s_plan": "Mochi 的计划",
			"mochi_writes_a_plan_when_it_next_wakes_up": "Mochi 下次醒来时会写一份计划",
			"mood": "心情",
			"mood_change": "心情 → {{value}}",
			"new_category": "新建分类…",
			"next": "下一页",
			"next_check": "下次：{{when}}",
			"no_activity_yet": "暂无活动",
			"no_memories_yet": "暂无回忆",
			"no_pinned_files": "没有已置顶文件",
			"no_plan_yet": "暂无计划",
			"notes": "备注",
			"nothing_being_watched": "没有正在监视的内容",
			"page_range": "第 {{from}}–{{to}} 项，共 {{total}} 项",
			"pinned_files": "已置顶文件",
			"prev": "上一页",
			"recent_activity": "近期活动",
			"refresh": "刷新",
			"spend_time_with_mochi_to_build_memories": "多陪陪 Mochi 来积累回忆",
			"status": "状态",
			"stop_watching": "停止监视",
			"this_is_the_browser_view_everything_here_is_live": "这是浏览器视图。这里的一切都是实时的，但宠物窗口\n            本身只出现在 {{productName}} 桌面应用中。",
			"top_moods": "常见心情",
			"trigger": "触发",
			"url_or_what_to_watch": "URL 或要监视的内容",
			"version": "版本",
			"watch": "监视",
			"what_mochi_can_do": "Mochi 能做什么",
			"what_to_call_it": "给它起个名字"
		},
		"mood": {
			"busy": "忙碌",
			"curious": "好奇",
			"happy": "开心",
			"scared": "害怕",
			"sleepy": "困困"
		},
		"pinned": {
			"empty_hint": "让 {{name}} 帮你钉住想追踪的文件",
			"unpin": "取消钉住"
		},
		"state": {
			"approval_pending": "等待审批中",
			"done": "完成",
			"error": "出错了",
			"hiding": "躲藏中",
			"idle": "发呆中",
			"listening": "聆听中",
			"offline": "离线中",
			"peekThinking": "偷瞄思考中",
			"peeking": "偷瞄中",
			"thinking": "思考中",
			"walking": "走路中",
			"working": "工作中"
		},
		"stats": {
			"busiest_day_other": "最话多的一天：{{date}}（{{n}} 句）",
			"companion_days": "陪伴了 {{time}}",
			"drags_other": "被拽了 {{n}} 次",
			"earliest_time": "最早 {{time}} 就起来了",
			"first_use": "和 {{name}} 的故事刚刚开始",
			"latest_time": "最晚陪你到 {{time}}",
			"longest_chat_other": "最长一次聊了 {{n}} 句",
			"messages": "聊了 {{total}} 句（你 {{sent}} · {{name}} {{received}}）",
			"mood_top": "心情分布",
			"peeks_other": "偷瞄了 {{n}} 次",
			"screenshots_other": "帮你看了 {{n}} 次屏幕",
			"streak": "（连续 {{streak}} 天）",
			"thinking_time": "想了 {{time}}",
			"title": "回忆",
			"walks_other": "走了 {{n}} 步"
		},
		"watchPanel": {
			"back": "返回",
			"clear_cancel": "保留",
			"clear_completed": "清除所有已完成",
			"clear_confirm": "清除",
			"clear_confirm_desc_other": "将删除 {{count}} 个已完成条目，无法撤销。",
			"clear_confirm_title": "清除已完成？",
			"clear_dismiss": "关闭",
			"clear_failed": "清除失败，什么都没有被删除，请重试。",
			"clear_working": "清除中…",
			"close": "关闭",
			"complete": "完成",
			"countdown": {
				"hours": "{{hours}} 小时 {{mins}} 分钟后检查",
				"mins": "{{mins}} 分钟后检查"
			},
			"empty": "暂无监控项",
			"empty_hint": "让 {{name}} 帮你盯一个价格、快递或网页",
			"field": {
				"check_count": "检查次数",
				"history": "历史记录",
				"interval": "检查间隔",
				"last_checked": "最近检查",
				"last_result": "最近结果",
				"next_check": "下次检查",
				"notes": "备注",
				"priority": "优先级",
				"target": "目标",
				"trigger_at": "提醒时间"
			},
			"hide_completed": "隐藏已完成",
			"history": {
				"no_changes": "暂无变化记录",
				"show_all": "显示全部（{{count}}）",
				"show_changes": "仅显示变化"
			},
			"kind": {
				"custom": "自定义",
				"meeting": "会议",
				"reminder": "提醒",
				"url": "网页"
			},
			"older_completed": "更早",
			"overdue": "即将检查",
			"priority": {
				"high": "高",
				"low": "低",
				"normal": "普通"
			},
			"recent_completed": "最近完成",
			"reopen": "重新监控",
			"save": "保存",
			"show_completed": "显示已完成（{{count}}）",
			"status": {
				"cancelled": "已取消",
				"done": "已完成",
				"expired": "已过期",
				"failed": "失败",
				"triggered": "已触发",
				"watching": "监控中"
			},
			"title": "监控列表"
		}
	} } }
};
/** What `{{productName}}` reads when the caller passes none. */
var PRODUCT_NAME$1 = "Kiro Crew";
var own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function lookup(catalog, key) {
	let node = catalog;
	for (const part of key.split(".")) {
		if (node === void 0 || typeof node === "string" || !own(node, part)) return void 0;
		node = node[part];
	}
	return typeof node === "string" && node !== "" ? node : void 0;
}
/** The catalogs to try for `locale`, most specific first, always ending in English. */
function localeChain(locale) {
	const chain = [];
	const add = (candidate) => {
		if (own(CATALOGS, candidate) && !chain.includes(candidate)) chain.push(candidate);
	};
	add(locale);
	add(locale.split("-")[0]);
	add("en");
	return chain;
}
function currentLocale() {
	try {
		const locale = activeLocale();
		return typeof locale === "string" && locale ? locale : "en";
	} catch {
		return "en";
	}
}
function pluralForm(locale, count) {
	try {
		return new Intl.PluralRules(locale).select(count);
	} catch {
		return count === 1 ? "one" : "other";
	}
}
/** Fill each `{{ name }}` from *vars* in one pass, so an inserted value is never read again. */
function interpolate(text, vars) {
	let out = "";
	let at = 0;
	for (;;) {
		const open = text.indexOf("{{", at);
		if (open < 0) break;
		const close = text.indexOf("}}", open + 2);
		if (close < 0) break;
		const name = text.slice(open + 2, close).trim();
		out += text.slice(at, open);
		out += own(vars, name) && vars[name] !== void 0 ? String(vars[name]) : text.slice(open, close + 2);
		at = close + 2;
	}
	return out + text.slice(at);
}
function i18nT(key, vars) {
	const count = vars && typeof vars.count === "number" ? vars.count : void 0;
	const values = {
		productName: PRODUCT_NAME$1,
		...vars ?? {}
	};
	for (const locale of localeChain(currentLocale())) {
		const catalog = CATALOGS[locale];
		let text;
		if (count !== void 0) text = lookup(catalog, `${key}_${pluralForm(locale, count)}`) ?? lookup(catalog, `${key}_other`);
		text = text ?? lookup(catalog, key);
		if (text !== void 0) return interpolate(text, values);
	}
	return key;
}
// src/dashboardData.ts
/**
* Pure shaping helpers for the Mochi dashboard page.
*
* Extracted from the original dashboard's inline logic (the render body did all
* of this in place) for one reason: the plan-task type switch below is the kind
* of code that fails INVISIBLY — a missed task type renders a blank or a raw
* `[object Object]` row instead of throwing, so only a test that enumerates the
* types can hold it.
*/
/**
* Render any value as a string.
*
* The original wrapped every field in this before rendering because plan and
* watch payloads are agent-authored: a nested object reaching JSX throws React
* error #31 and takes the whole page down. The queue is a structural type over
* parsed JSON (see queue_file.py), so the guarantee is still only "valid JSON",
* and the wrapper is still load-bearing.
*/
function str(v) {
	if (v == null) return "—";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return JSON.stringify(v);
}
function hhmm(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "";
	return fmtDateFields(d, {
		hour: "2-digit",
		minute: "2-digit"
	});
}
/** Describe one queued task in a single line. Mirrors the original's switch. */
function describeTask(task) {
	const type = str(task.type ?? "");
	const action = task.action ?? {};
	const isObj = typeof task.action === "object" && task.action !== null;
	if (type === "notify" || type === "reminder") return str(action.message ?? action.title ?? (isObj ? type : task.action));
	if (type === "mood") return i18nT("apps.mochi.mochiPage.mood_change", { value: str(action.value ?? (isObj ? "?" : task.action)) });
	if (type === "move") {
		if (action.behavior !== void 0) return str(action.behavior).replace(/_/g, " ");
		if (action.x !== void 0) return "wander";
		return str(type);
	}
	if (type === "watch" || type === "check") return str(action.label ?? (isObj ? type : task.action));
	return str(action.message ?? action.label ?? type ?? "?");
}
/**
* The planner's queue as a timeline.
*
* Only tasks carrying `execute_after` appear — an untimed task has no place on a
* time-ordered list, and the original filtered the same way.
*/
function formatPlanTasks(plan) {
	return (Array.isArray(plan?.tasks) ? plan.tasks : []).filter((t) => Boolean(t?.execute_after)).map((t) => ({
		time: hhmm(t.execute_after),
		action: describeTask(t),
		done: Boolean(t.done)
	}));
}
/** Entry types that are bookkeeping rather than something the user did. */
var NOISE = /* @__PURE__ */ new Set(["session_restore"]);
/**
* Activity entries as display rows, newest first.
*
* The narrative is prepended as a synthetic `plan` row so the card leads with
* what Mochi believes it is currently doing — the original did this because the
* narrative is the single most current line available and would otherwise only
* appear buried in the Plan card.
*/
function formatActivity(entries, narrative) {
	const rows = (entries ?? []).filter((e) => !NOISE.has(e.type)).sort((a, b) => (a.ts || "") < (b.ts || "") ? 1 : (a.ts || "") > (b.ts || "") ? -1 : 0).map((e) => ({
		time: hhmm(e.ts),
		type: str(e.type),
		content: sliceCodePoints(str(e.content), 0, 150)
	}));
	if (narrative && narrative !== "—" && narrative !== "Active") rows.unshift({
		time: "now",
		type: "plan",
		content: narrative
	});
	return rows;
}
/**
* Watch items as the expandable rows the original's Watchlist card renders.
*
* The dashboard is a "currently watching" surface, so items that reached a natural
* end (done, failed, expired) are dropped here — the panel window still lists them.
*
* CANCELLED is deliberately NOT dropped. Cancelling is one unconfirmed click on a
* row, and dropping the item made that click unrecoverable for anyone without the
* desktop panel: no undo, no reopen, no feedback that anything happened. Keeping the
* row (marked, with Reopen) is what makes the action reversible on this surface.
*/
function formatWatchItems(items) {
	return (items ?? []).filter((w) => w.status === "cancelled" || !TERMINAL_STATUSES.includes(w.status)).map((w, i) => ({
		id: str(w.id || `wl-${i}`),
		type: str(w.kind),
		label: str(w.label || w.id),
		status: str(w.status),
		notes: str(w.notes || ""),
		trigger: str(w.triggerCondition || ""),
		created: w.createdAt ? fmtDate(w.createdAt) : "",
		checks: w.checkCount != null ? `${w.checkCount} checks` : "",
		nextCheck: w.nextCheckAfter ? fmtDateFields(w.nextCheckAfter, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		}) : "",
		cancelled: str(w.status) === "cancelled"
	}));
}
/** Badge tone for a watch status. Terminal-good vs failed vs in-flight. */
function statusTone(status) {
	if ([
		"ok",
		"done",
		"merged",
		"succeeded",
		"watching"
	].includes(status)) return "ok";
	if (["failed", "error"].includes(status)) return "err";
	return "warn";
}
// src/i18nKeys.ts
/**
* Full literal translation keys for Mochi's runtime discriminants.
*
* These four vocabularies — animation state, mood, watch status, watch priority —
* arrive as VALUES at runtime, so the natural way to translate them is to
* interpolate the value into the key. That is exactly what this module exists to
* avoid, and `src/i18n/dynamicKeys.test.ts` enforces it: a key assembled by
* interpolation appears nowhere in the source, so the extractor cannot find it,
* the unused-key sweep counts it as dead and may prune it, and the `en-XA`
* pseudolocale cannot flag it as untranslated. It then renders as the raw key the
* first time a value is added without a matching entry.
*
* Mapping value -> full literal key keeps every key greppable, and the lookups
* below fall back to the raw value on purpose rather than throwing: a pack may
* declare a slot this build has no label for, and showing the slot name beats an
* empty label or a crash.
*
* Key sets mirror `apps.mochi.{state,mood,watchPanel.status,watchPanel.priority}`
* in the catalog. Note the leaves are NOT snake_cased the way the rest of the
* catalog is: each one has to equal the value the code actually holds
* (`peekThinking` is an animation slot name, `approval_pending` a state id), so
* these leaves are data, not free-form naming.
*/
var STATE_LABEL_KEY = {
	approval_pending: "apps.mochi.state.approval_pending",
	done: "apps.mochi.state.done",
	error: "apps.mochi.state.error",
	hiding: "apps.mochi.state.hiding",
	idle: "apps.mochi.state.idle",
	listening: "apps.mochi.state.listening",
	offline: "apps.mochi.state.offline",
	peekThinking: "apps.mochi.state.peekThinking",
	peeking: "apps.mochi.state.peeking",
	thinking: "apps.mochi.state.thinking",
	walking: "apps.mochi.state.walking",
	working: "apps.mochi.state.working"
};
var MOOD_LABEL_KEY = {
	busy: "apps.mochi.mood.busy",
	curious: "apps.mochi.mood.curious",
	happy: "apps.mochi.mood.happy",
	scared: "apps.mochi.mood.scared",
	sleepy: "apps.mochi.mood.sleepy"
};
var WATCH_STATUS_KEY = {
	cancelled: "apps.mochi.watchPanel.status.cancelled",
	done: "apps.mochi.watchPanel.status.done",
	expired: "apps.mochi.watchPanel.status.expired",
	failed: "apps.mochi.watchPanel.status.failed",
	triggered: "apps.mochi.watchPanel.status.triggered",
	watching: "apps.mochi.watchPanel.status.watching"
};
/**
* Activity-log entry kinds.
*
* The five backend kinds are the literals `log_activity(..., kind, ...)` is called
* with (`activity_log.py` takes `kind` as a free string, so the vocabulary lives at
* the call sites); `plan` is synthesized in the frontend by `formatActivity`, which
* puts the current narrative at the top of the list. A drift guard in
* `test_mochi_activity.py` ties this map to those call sites.
*/
var ACTIVITY_TYPE_KEY = {
	budget: "apps.mochi.activity.type.budget",
	memory: "apps.mochi.activity.type.memory",
	presence: "apps.mochi.activity.type.presence",
	notification: "apps.mochi.activity.type.notification",
	plan: "apps.mochi.activity.type.plan",
	sleep: "apps.mochi.activity.type.sleep",
	spawn: "apps.mochi.activity.type.spawn",
	system: "apps.mochi.activity.type.system"
};
/**
* Watch-item kinds.
*
* `url` and `custom` are the two seed kinds a user picks in the add form;
* `reminder` and `meeting` are time-triggered and created by the agent, and the
* panel branches on them (they have no check target), so they surface as labels
* too.
*/
var WATCH_KIND_KEY = {
	custom: "apps.mochi.watchPanel.kind.custom",
	meeting: "apps.mochi.watchPanel.kind.meeting",
	reminder: "apps.mochi.watchPanel.kind.reminder",
	url: "apps.mochi.watchPanel.kind.url"
};
/** Localized animation-state label, falling back to the raw slot name. */
function stateLabel(state) {
	const k = state;
	return STATE_LABEL_KEY[k] ? i18nT(STATE_LABEL_KEY[k]) : state;
}
/** Localized mood label, falling back to the raw mood id. */
function moodLabel(mood) {
	const k = mood;
	return MOOD_LABEL_KEY[k] ? i18nT(MOOD_LABEL_KEY[k]) : mood;
}
/** Localized watch-item status, falling back to the raw status. */
function watchStatusLabel(status) {
	const k = status;
	return WATCH_STATUS_KEY[k] ? i18nT(WATCH_STATUS_KEY[k]) : status;
}
/** Localized activity-log entry kind, falling back to the raw kind. */
function activityTypeLabel(type) {
	const k = type;
	return ACTIVITY_TYPE_KEY[k] ? i18nT(ACTIVITY_TYPE_KEY[k]) : type;
}
/** Localized watch-item kind, falling back to the raw kind. */
function watchKindLabel(kind) {
	const k = kind;
	return WATCH_KIND_KEY[k] ? i18nT(WATCH_KIND_KEY[k]) : kind;
}
// src/shared/statsFormatters.ts
/**
* The active UI locale as a BCP-47 tag.
*
* Read at call time rather than passed in: these helpers used to take a `lang`
* argument threaded down from a component, which existed only to feed a
* `lang === 'zh' ? … : …` ternary — so every duration and date in this file knew
* exactly two languages and silently fell back to English for the other eight.
*/
function locale() {
	return currentLocale();
}
/**
* A count with its unit, localized.
*
* `Intl` rather than catalog keys on purpose: unit names, their placement, and
* whether a space precedes them are locale data, not copy. Hard-coding one
* language's unit against English gets those two right and the other eight
* wrong, and
* adding `unit_second`-style keys per locale would re-derive, by hand, a table
* the platform already ships.
*/
function unit(value, name) {
	return new Intl.NumberFormat(locale(), {
		style: "unit",
		unit: name,
		unitDisplay: "narrow"
	}).format(value);
}
/** Format thinking time as a human-readable string (floor-rounded) */
function formatThinkingTime(seconds) {
	let time;
	if (seconds < 60) time = unit(seconds, "second");
	else if (seconds < 3600) time = unit(Math.floor(seconds / 60), "minute");
	else {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor(seconds % 3600 / 60);
		time = mins > 0 ? `${unit(hours, "hour")} ${unit(mins, "minute")}` : unit(hours, "hour");
	}
	return i18nT("apps.mochi.stats.thinking_time", { time });
}
/** Get top N moods sorted by count with percentages */
function getTopMoods(moods, limit = 3) {
	const entries = Object.entries(moods).filter(([, c]) => c > 0);
	if (entries.length === 0) return [];
	const total = entries.reduce((sum, [, c]) => sum + c, 0);
	return entries.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([mood, count]) => ({
		mood,
		count,
		percent: Math.round(count / total * 100)
	}));
}
/** Format companionSeconds as a human-readable duration */
function formatCompanionTime(seconds) {
	if (seconds < 3600) return unit(Math.max(1, Math.floor(seconds / 60)), "minute");
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor(seconds % 3600 / 60);
	if (mins === 0) return unit(hours, "hour");
	return `${unit(hours, "hour")} ${unit(mins, "minute")}`;
}
/** Check if a stat value should be displayed (non-zero, non-empty) */
function shouldShowStat(value) {
	if (typeof value === "number") return value > 0;
	return value !== "";
}
/** Format a YYYY-MM-DD date string for display (localized) */
function formatDate(dateStr) {
	if (!dateStr) return "";
	const parts = dateStr.split("-");
	if (parts.length !== 3) return dateStr;
	const [year, month, day] = parts.map((p) => parseInt(p, 10));
	if ([
		year,
		month,
		day
	].some(Number.isNaN)) return dateStr;
	return new Intl.DateTimeFormat(locale(), {
		month: "numeric",
		day: "numeric"
	}).format(new Date(year, month - 1, day));
}
// src/shared/config.ts
/** The pet's product/brand name. Not translatable; mirrors backend soul_loader.DEFAULT_PET_NAME. */
var PRODUCT_NAME = "Mochi";
// src/host/NativeSelect.tsx
/**
* The fallback for `Select` on a host that does not export one: a plain native
* `<select>` with the same props, so the call sites do not branch.
*/
function NativeSelect({ options, optionLabels, value, onChange, clearLabel, disabled, "aria-label": ariaLabel, title, className }) {
	const emptyRow = clearLabel !== void 0 || !options.includes(value);
	return /* @__PURE__ */ jsxs("select", {
		value,
		onChange: (e) => onChange(e.target.value),
		disabled,
		"aria-label": ariaLabel,
		title,
		className: "text-sm px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" + (className ? ` ${className}` : ""),
		children: [emptyRow && /* @__PURE__ */ jsx("option", {
			value: "",
			children: clearLabel ?? ""
		}), options.map((option, index) => /* @__PURE__ */ jsx("option", {
			value: option,
			children: optionLabels?.[index] ?? option
		}, option))]
	});
}
// src/host/Select.tsx
var Select = ("Select" in ui ? ui.Select : void 0) ?? NativeSelect;
// src/MochiPage.tsx
/**
* MochiPage — the Mochi builtin's dashboard page (route /mochi).
*
* PORT of the original `src/dashboard/index.tsx`: same information architecture
* (status stat row → Activity | Memories → Watchlist | Plan → offline landing)
* and the same primitives, which happen to carry the same names and signatures
* here as in the original's UI kit — so the markup is a near-verbatim carry-over
* with only the import path changed.
*
* Three deliberate divergences, all forced by the builtin architecture:
*
* 1. DATA SOURCE. The original reached a separate Electron backend process
*    through the gateway's reverse proxy and spoke MCP JSON-RPC to it
*    (`/apps/mochi/api/mcp`, `tools/call`). Here the backend is in-process,
*    so every panel reads a plain same-origin route (see backend/routes.py).
*    The MCP shim still exists for the AGENT; the page must not be a second
*    client of it.
*
* 2. "ONLINE" MEANS "ENABLED". The original probed whether its app process was
*    reachable. There is no such process now — the runtime is up whenever the
*    app is enabled — so the landing state keys off the enable flag, which the
*    backend guard already reports distinctly (403 disabled / 503 starting).
*    That also makes the landing's CTA real: the original's "Launch Mochi"
*    POSTed an openCommand this manifest does not declare, whereas enabling is
*    something the page can genuinely do.
*
* 3. ICONS, NOT EMOJI. The original used emoji for every decorative glyph. The
*    repo convention is lucide components (see AGENTS.md), which EmptyState's
*    `icon: React.ReactNode` accepts directly. The one emoji kept is the mood
*    glyph, because that is DATA the state machine produces, not decoration.
*
* Panels the original page did not have — the add-watch form, pinned files, and
* the avatar/instance controls — are kept below the ported grid rather than
* dropped, since they are the only dashboard-side access to those features.
*/
/**
* The app's own name, as shown in the page header.
*
* A constant rather than a catalog key: a product name is a proper noun and has
* no translation, so a key would only add ten identical catalog entries. Also
* deliberately NOT `DEFAULT_PET_NAME` — the pet can be renamed by the user, the
* product cannot, and conflating them would retitle this page when someone
* renames their pet.
*/
var POLL_LIVE_MS = 1e4;
var POLL_WAITING_MS = 5e3;
var PER_PAGE = 10;
function MochiPage() {
	const qc = useQueryClient();
	const { data: status, isLoading } = useQuery({
		queryKey: ["mochi", "enabled"],
		queryFn: probeEnabled,
		refetchInterval: (q) => q.state.data === "enabled" ? POLL_LIVE_MS : POLL_WAITING_MS
	});
	const enableMut = useMutation({
		mutationFn: enableMochi,
		onSuccess: () => qc.invalidateQueries({ queryKey: ["mochi"] })
	});
	if (isLoading || status === void 0) return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(PageHeader, {
		title: PRODUCT_NAME,
		subtitle: i18nT("apps.mochi.instances.connecting")
	}), /* @__PURE__ */ jsx("div", {
		className: "px-4 md:px-6 pb-8",
		children: /* @__PURE__ */ jsx("div", {
			className: "space-y-4 animate-pulse",
			children: [
				1,
				2,
				3
			].map((i) => /* @__PURE__ */ jsx("div", { className: "h-16 rounded bg-bg-elevated" }, i))
		})
	})] });
	if (status !== "enabled") return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(PageHeader, {
		title: PRODUCT_NAME,
		subtitle: i18nT("apps.mochi.mochiPage.desktop_pet_companion")
	}), /* @__PURE__ */ jsx(OfflineLanding, {
		starting: status === "starting",
		pending: enableMut.isPending,
		error: enableMut.isError ? enableMut.error.message : null,
		onEnable: () => enableMut.mutate(),
		onRetry: () => qc.invalidateQueries({ queryKey: ["mochi", "enabled"] })
	})] });
	return /* @__PURE__ */ jsx(LiveView, {});
}
var features = () => [
	[/* @__PURE__ */ jsx(Cat, { className: "w-4 h-4" }), i18nT("apps.mochi.mochiPage.feat_pet")],
	[/* @__PURE__ */ jsx(Eye, { className: "w-4 h-4" }), i18nT("apps.mochi.mochiPage.feat_watch")],
	[/* @__PURE__ */ jsx(MessageSquare, { className: "w-4 h-4" }), i18nT("apps.mochi.mochiPage.feat_chat")],
	[/* @__PURE__ */ jsx(Camera, { className: "w-4 h-4" }), i18nT("apps.mochi.mochiPage.feat_screenshot")],
	[/* @__PURE__ */ jsx(CalendarClock, { className: "w-4 h-4" }), i18nT("apps.mochi.mochiPage.feat_briefing")],
	[/* @__PURE__ */ jsx(Bot, { className: "w-4 h-4" }), i18nT("apps.mochi.mochiPage.feat_subagent")]
];
function OfflineLanding({ starting, pending, error, onEnable, onRetry }) {
	return /* @__PURE__ */ jsx("div", {
		className: "flex items-center justify-center py-16",
		children: /* @__PURE__ */ jsxs("div", {
			className: "text-center max-w-md",
			children: [
				/* @__PURE__ */ jsx(Cat, { className: "w-16 h-16 mx-auto mb-4 opacity-40" }),
				/* @__PURE__ */ jsx("div", {
					className: "text-xl font-bold text-text-strong mb-2",
					children: i18nT("apps.mochi.mochiPage.mochi_is_sleeping")
				}),
				/* @__PURE__ */ jsx("div", {
					className: "text-sm text-muted mb-6",
					children: starting ? i18nT("apps.mochi.mochiPage.landing_starting") : i18nT("apps.mochi.mochiPage.landing_enable_hint")
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex gap-2 justify-center mb-8",
					children: [!starting && /* @__PURE__ */ jsx(Btn, {
						primary: true,
						onClick: onEnable,
						disabled: pending,
						children: pending ? i18nT("apps.mochi.mochiPage.enabling") : i18nT("apps.mochi.mochiPage.enable_mochi")
					}), /* @__PURE__ */ jsxs(Btn, {
						onClick: onRetry,
						children: [
							/* @__PURE__ */ jsx(RefreshCw, { className: "w-3.5 h-3.5 lucide-inline" }),
							" ",
							i18nT("apps.mochi.mochiPage.check_again")
						]
					})]
				}),
				/* @__PURE__ */ jsx(ErrorNotice, {
					className: "text-left mb-4",
					message: error,
					askAgent: true
				}),
				/* @__PURE__ */ jsxs(Card, {
					className: "text-left mt-4",
					children: [/* @__PURE__ */ jsx(CardTitle, { children: i18nT("apps.mochi.mochiPage.what_mochi_can_do") }), /* @__PURE__ */ jsx("div", {
						className: "space-y-3 px-1 pt-1",
						children: features().map(([icon, text], i) => /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-3 text-[13px] text-muted",
							children: [/* @__PURE__ */ jsx("span", {
								className: "shrink-0",
								children: icon
							}), /* @__PURE__ */ jsx("span", { children: text })]
						}, i))
					})]
				})
			]
		})
	});
}
function LiveView() {
	const qc = useQueryClient();
	const petState = useQuery({
		queryKey: ["mochi", "pet-state"],
		queryFn: getPetState,
		refetchInterval: POLL_LIVE_MS
	});
	const plan = useQuery({
		queryKey: ["mochi", "plan"],
		queryFn: getPlan,
		refetchInterval: POLL_LIVE_MS
	});
	const activity = useQuery({
		queryKey: ["mochi", "activity"],
		queryFn: getActivity,
		refetchInterval: POLL_LIVE_MS
	});
	const version = useQuery({
		queryKey: ["mochi", "version"],
		queryFn: getMochiVersion,
		staleTime: Infinity
	});
	const narrative = str(plan.data?.narrative ?? "—");
	const liveMood = petState.data?.mood;
	const rawMood = str((typeof liveMood === "string" && liveMood !== "" ? liveMood : void 0) ?? plan.data?.mood ?? "—");
	const mood = rawMood === "—" ? rawMood : moodLabel(rawMood);
	const state = petState.data?.state ?? "offline";
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(PageHeader, {
		title: PRODUCT_NAME,
		subtitle: i18nT("apps.mochi.mochiPage.desktop_pet_companion")
	}), /* @__PURE__ */ jsxs("div", {
		className: "px-4 md:px-6 pb-8 overflow-y-auto flex-1 min-h-0",
		children: [
			!isElectron && /* @__PURE__ */ jsx("div", {
				role: "note",
				className: "mb-4 text-[13px] text-muted",
				children: i18nT("apps.mochi.mochiPage.this_is_the_browser_view_everything_here_is_live")
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] mb-6",
				children: [
					/* @__PURE__ */ jsx(StatCard, {
						label: i18nT("apps.mochi.mochiPage.status"),
						value: stateLabel(state),
						accent: state !== "offline"
					}),
					/* @__PURE__ */ jsx(StatCard, {
						label: i18nT("apps.mochi.mochiPage.mood"),
						value: mood
					}),
					/* @__PURE__ */ jsx(StatCard, {
						label: i18nT("apps.mochi.mochiPage.version"),
						value: version.data || "—"
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "grid grid-cols-2 gap-4 mb-4",
				children: [/* @__PURE__ */ jsxs(Card, { children: [/* @__PURE__ */ jsx(CardTitle, { children: i18nT("apps.mochi.mochiPage.recent_activity") }), /* @__PURE__ */ jsx(ActivityList, { rows: formatActivity(activity.data?.entries, narrative) })] }), /* @__PURE__ */ jsxs(Card, { children: [/* @__PURE__ */ jsx(CardTitle, { children: i18nT("apps.mochi.stats.title") }), /* @__PURE__ */ jsx(MemoriesCard, {})] })]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "grid grid-cols-2 gap-4 mb-4",
				children: [/* @__PURE__ */ jsxs(Card, { children: [/* @__PURE__ */ jsx(CardTitle, { children: i18nT("apps.mochi.watchPanel.title") }), /* @__PURE__ */ jsx(WatchlistCard, {})] }), /* @__PURE__ */ jsxs(Card, { children: [
					/* @__PURE__ */ jsx(CardTitle, { children: i18nT("apps.mochi.mochiPage.mochi_s_plan") }),
					narrative !== "—" && narrative !== "Active" && /* @__PURE__ */ jsx("div", {
						className: "text-[13px] text-muted mb-3 leading-relaxed",
						children: narrative
					}),
					/* @__PURE__ */ jsx(PlanTimeline, { tasks: formatPlanTasks(plan.data) })
				] })]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mb-4",
				children: /* @__PURE__ */ jsxs(Card, { children: [/* @__PURE__ */ jsx(CardTitle, { children: i18nT("apps.mochi.mochiPage.pinned_files") }), /* @__PURE__ */ jsx(PinnedCard, {})] })
			}),
			/* @__PURE__ */ jsxs(Btn, {
				onClick: () => qc.invalidateQueries({ queryKey: ["mochi"] }),
				children: [
					/* @__PURE__ */ jsx(RefreshCw, { className: "w-3.5 h-3.5 lucide-inline" }),
					" ",
					i18nT("apps.mochi.mochiPage.refresh")
				]
			})
		]
	})] });
}
function Pager({ page, total, onPage }) {
	if (total <= PER_PAGE) return null;
	const last = (page + 1) * PER_PAGE >= total;
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-center justify-between mt-3 pt-2 border-t border-border text-[13px] text-muted",
		children: [/* @__PURE__ */ jsx("span", { children: i18nT("apps.mochi.mochiPage.page_range", {
			from: page * PER_PAGE + 1,
			to: Math.min((page + 1) * PER_PAGE, total),
			total
		}) }), /* @__PURE__ */ jsxs("div", {
			className: "flex gap-1.5",
			children: [/* @__PURE__ */ jsx(Btn, {
				disabled: page === 0,
				onClick: () => onPage(page - 1),
				children: i18nT("apps.mochi.mochiPage.prev")
			}), /* @__PURE__ */ jsx(Btn, {
				disabled: last,
				onClick: () => onPage(page + 1),
				children: i18nT("apps.mochi.mochiPage.next")
			})]
		})]
	});
}
/** Tone per activity kind. Keys are the kinds in `ACTIVITY_TYPE_KEY`; anything
*  unlisted falls back to the neutral tone, so a new kind degrades rather than
*  throwing. `sleep`/`wake` used to be listed here and are not kinds the backend
*  ever writes — `budget`/`spawn`/`system` are. */
var ACTIVITY_TONES = {
	budget: "bg-warn-subtle text-warn-text",
	memory: "bg-aim-subtle text-aim",
	notification: "bg-accent-subtle text-accent",
	plan: "bg-accent-subtle text-accent",
	presence: "bg-bg-elevated text-muted",
	sleep: "bg-warn-subtle text-warn-text",
	spawn: "bg-accent-subtle text-accent",
	system: "bg-warn-subtle text-warn-text"
};
function ActivityList({ rows }) {
	const [page, setPage] = useState(0);
	if (rows.length === 0) return /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(ScrollText, { className: "w-5 h-5" }),
		title: i18nT("apps.mochi.mochiPage.no_activity_yet"),
		subtitle: i18nT("apps.mochi.mochiPage.mochi_logs_events_here_as_they_happen")
	});
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
		className: "space-y-1 max-h-64 overflow-y-auto",
		children: rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((e, i) => /* @__PURE__ */ jsxs("div", {
			className: "flex items-start gap-3 px-2.5 py-1.5 text-[13px]",
			children: [
				/* @__PURE__ */ jsx("span", {
					className: "text-muted font-mono w-16 shrink-0 whitespace-nowrap",
					children: e.time
				}),
				/* @__PURE__ */ jsx("span", {
					className: `px-1.5 py-[1px] rounded text-[11px] font-medium shrink-0 ${ACTIVITY_TONES[e.type] ?? "bg-bg-elevated text-muted"}`,
					children: activityTypeLabel(e.type)
				}),
				/* @__PURE__ */ jsx("span", {
					className: "text-text",
					children: e.content
				})
			]
		}, i))
	}), /* @__PURE__ */ jsx(Pager, {
		page,
		total: rows.length,
		onPage: setPage
	})] });
}
function PlanTimeline({ tasks }) {
	const [page, setPage] = useState(0);
	if (tasks.length === 0) return /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(ClipboardList, { className: "w-5 h-5" }),
		title: i18nT("apps.mochi.mochiPage.no_plan_yet"),
		subtitle: i18nT("apps.mochi.mochiPage.mochi_writes_a_plan_when_it_next_wakes_up")
	});
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
		className: "space-y-1.5",
		children: tasks.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((t, i) => /* @__PURE__ */ jsxs("div", {
			className: `flex items-center gap-3 px-2.5 py-1.5 rounded-md text-[13px] ${t.done ? "text-muted line-through" : "text-text"}`,
			children: [
				/* @__PURE__ */ jsx("span", {
					className: "text-muted font-mono w-16 shrink-0 whitespace-nowrap",
					children: t.time
				}),
				/* @__PURE__ */ jsx("span", { className: `w-2 h-2 rounded-full shrink-0 ${t.done ? "bg-ok" : "bg-border"}` }),
				/* @__PURE__ */ jsx("span", { children: t.action })
			]
		}, i))
	}), /* @__PURE__ */ jsx(Pager, {
		page,
		total: tasks.length,
		onPage: setPage
	})] });
}
function WatchlistCard() {
	const qc = useQueryClient();
	const invalidate = () => qc.invalidateQueries({ queryKey: ["mochi", "watchlist"] });
	const { data } = useQuery({
		queryKey: ["mochi", "watchlist"],
		queryFn: getWatchlist,
		refetchInterval: POLL_LIVE_MS
	});
	const cancelMut = useMutation({
		mutationFn: (id) => updateWatchlist({ cancel: [id] }),
		onSuccess: invalidate
	});
	const reopenMut = useMutation({
		mutationFn: (id) => updateWatchlist({ update: [{
			id,
			status: "watching"
		}] }),
		onSuccess: invalidate
	});
	const addMut = useMutation({
		mutationFn: addToWatchlist,
		onSuccess: invalidate
	});
	const items = data?.items ?? [];
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsx(AddWatchForm, {
			existingKinds: items.map((i) => i.kind).filter(Boolean),
			failed: addMut.isError,
			onAdd: (label, kind, target, done) => addMut.mutate({
				label,
				kind,
				target
			}, { onSuccess: done })
		}),
		cancelMut.isError ? /* @__PURE__ */ jsx(ErrorNotice, {
			className: "mt-3",
			message: cancelMut.error.message
		}) : null,
		reopenMut.isError ? /* @__PURE__ */ jsx(ErrorNotice, {
			className: "mt-3",
			message: reopenMut.error.message
		}) : null,
		/* @__PURE__ */ jsx("div", {
			className: "mt-3",
			children: /* @__PURE__ */ jsx(WatchRows, {
				rows: formatWatchItems(items),
				onCancel: (id) => cancelMut.mutate(id),
				onReopen: (id) => reopenMut.mutate(id)
			})
		})
	] });
}
function WatchRows({ rows, onCancel, onReopen }) {
	const [expanded, setExpanded] = useState(null);
	if (rows.length === 0) return /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(Eye, { className: "w-5 h-5" }),
		title: i18nT("apps.mochi.mochiPage.nothing_being_watched"),
		subtitle: i18nT("apps.mochi.mochiPage.add_something_above_or_ask_mochi_to_keep_an_eye")
	});
	return /* @__PURE__ */ jsx("div", {
		className: "space-y-1",
		children: rows.map((item) => {
			const isOpen = expanded === item.id;
			const Chevron = isOpen ? ChevronDown : ChevronRight;
			return /* @__PURE__ */ jsxs("div", {
				className: "border border-border rounded-md overflow-hidden",
				children: [/* @__PURE__ */ jsxs(Clickable, {
					className: "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-bg-hover transition-colors",
					"aria-expanded": isOpen,
					onClick: () => setExpanded(isOpen ? null : item.id),
					children: [
						/* @__PURE__ */ jsx("span", {
							className: "text-[13px] text-muted w-24 shrink-0 truncate",
							children: watchKindLabel(item.type)
						}),
						/* @__PURE__ */ jsx("span", {
							className: "text-[13px] text-text flex-1 truncate",
							children: item.label
						}),
						/* @__PURE__ */ jsx(Badge, {
							variant: statusTone(item.status),
							children: watchStatusLabel(item.status)
						}),
						/* @__PURE__ */ jsx("button", {
							title: i18nT(item.cancelled ? "apps.mochi.watchPanel.reopen" : "apps.mochi.mochiPage.stop_watching"),
							"aria-label": i18nT(item.cancelled ? "apps.mochi.watchPanel.reopen" : "apps.mochi.mochiPage.stop_watching"),
							className: "opacity-50 hover:opacity-100 shrink-0",
							onClick: (e) => {
								e.stopPropagation();
								if (item.cancelled) onReopen(item.id);
								else onCancel(item.id);
							},
							children: item.cancelled ? /* @__PURE__ */ jsx(RotateCcw, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx(XCircle, { className: "w-4 h-4" })
						}),
						/* @__PURE__ */ jsx(Chevron, { className: "w-3.5 h-3.5 text-muted shrink-0" })
					]
				}), isOpen && /* @__PURE__ */ jsxs("div", {
					className: "px-3 pb-3 pt-1 border-t border-border bg-bg-elevated/50 space-y-1.5 text-[13px]",
					children: [
						item.notes && /* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsxs("span", {
								className: "text-muted",
								children: [i18nT("apps.mochi.mochiPage.notes"), ":"]
							}),
							" ",
							/* @__PURE__ */ jsx("span", {
								className: "text-text",
								children: item.notes
							})
						] }),
						item.trigger && /* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsxs("span", {
								className: "text-muted",
								children: [i18nT("apps.mochi.mochiPage.trigger"), ":"]
							}),
							" ",
							/* @__PURE__ */ jsx("span", {
								className: "text-text",
								children: item.trigger
							})
						] }),
						/* @__PURE__ */ jsxs("div", {
							className: "flex gap-4 text-muted",
							children: [
								item.created && /* @__PURE__ */ jsxs("span", { children: [
									i18nT("apps.mochi.mochiPage.created"),
									" ",
									item.created
								] }),
								item.checks && /* @__PURE__ */ jsx("span", { children: item.checks }),
								item.nextCheck && /* @__PURE__ */ jsx("span", { children: i18nT("apps.mochi.mochiPage.next_check", { when: item.nextCheck }) })
							]
						})
					]
				})]
			}, item.id);
		})
	});
}
function AddWatchForm({ existingKinds, onAdd, failed }) {
	const [label, setLabel] = useState("");
	const [kind, setKind] = useState("url");
	const [target, setTarget] = useState("");
	const [newKind, setNewKind] = useState("");
	const creating = kind === NEW_KIND;
	const kinds = Array.from(/* @__PURE__ */ new Set([
		"url",
		"custom",
		...existingKinds
	]));
	return /* @__PURE__ */ jsxs("form", {
		className: "flex gap-2 items-end flex-wrap",
		onSubmit: (e) => {
			e.preventDefault();
			const finalKind = creating ? newKind.trim().toLowerCase() : kind;
			if (!label.trim() || !target.trim() || !finalKind) return;
			onAdd(label.trim(), finalKind, target.trim(), () => {
				setLabel("");
				setTarget("");
				setNewKind("");
			});
			if (creating && finalKind) setKind(finalKind);
		},
		children: [
			/* @__PURE__ */ jsxs("label", {
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ jsx("span", {
					className: "text-[10px] text-muted",
					children: i18nT("apps.mochi.mochiPage.field_name")
				}), /* @__PURE__ */ jsx("input", {
					value: label,
					onChange: (e) => setLabel(e.target.value),
					"aria-label": i18nT("apps.mochi.mochiPage.field_name"),
					placeholder: i18nT("apps.mochi.mochiPage.what_to_call_it"),
					className: "rounded-md border border-border bg-transparent px-2 py-1.5 text-sm w-32"
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ jsx("span", {
					className: "text-[10px] text-muted",
					children: i18nT("apps.mochi.mochiPage.field_category")
				}), /* @__PURE__ */ jsx(Select, {
					options: categoryOptions(kinds, kind),
					optionLabels: categoryOptions(kinds, kind).map((k) => k === NEW_KIND ? i18nT("apps.mochi.mochiPage.new_category") : watchKindLabel(k)),
					value: kind,
					onChange: setKind,
					"aria-label": i18nT("apps.mochi.mochiPage.field_category")
				})]
			}),
			creating && /* @__PURE__ */ jsxs("label", {
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ jsx("span", {
					className: "text-[10px] text-muted",
					children: i18nT("apps.mochi.mochiPage.category_name")
				}), /* @__PURE__ */ jsx("input", {
					value: newKind,
					onChange: (e) => setNewKind(e.target.value),
					"aria-label": i18nT("apps.mochi.mochiPage.category_name"),
					placeholder: i18nT("apps.mochi.mochiPage.category_name"),
					autoFocus: true,
					className: "rounded-md border border-border bg-transparent px-2 py-1.5 text-sm w-28"
				})]
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "flex flex-col gap-1 flex-1 min-w-32",
				children: [/* @__PURE__ */ jsx("span", {
					className: "text-[10px] text-muted",
					children: i18nT("apps.mochi.mochiPage.field_target")
				}), /* @__PURE__ */ jsx("input", {
					value: target,
					onChange: (e) => setTarget(e.target.value),
					"aria-label": i18nT("apps.mochi.mochiPage.field_target"),
					placeholder: i18nT("apps.mochi.mochiPage.url_or_what_to_watch"),
					className: "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm"
				})]
			}),
			/* @__PURE__ */ jsxs(Btn, {
				primary: true,
				type: "submit",
				children: [
					/* @__PURE__ */ jsx(Plus, { className: "w-3.5 h-3.5 lucide-inline" }),
					" ",
					i18nT("apps.mochi.mochiPage.watch")
				]
			}),
			failed && /* @__PURE__ */ jsx(ErrorNotice, {
				className: "w-full",
				message: i18nT("apps.mochi.mochiPage.add_failed")
			})
		]
	});
}
/** The "New category…" choice of the category picker (see AddWatchForm). */
var NEW_KIND = "__new__";
/** The picker's choices: the seed and stored kinds, the chosen one if the list lacks it, then "New category…". */
function categoryOptions(kinds, chosen) {
	const extra = chosen && chosen !== NEW_KIND && !kinds.includes(chosen) ? [chosen] : [];
	return [
		...kinds,
		...extra,
		NEW_KIND
	];
}
/**
* Build the memory rows.
*
* The arithmetic comes from `panel/statsFormatters` — the very module the panel's
* MemoriesView uses — so the two surfaces cannot drift on what "6 days together"
* means. Only the icon and layout are dashboard-flavoured. (MemoriesView itself
* is not reusable here: it fetches over the panel bridge and is styled inline for
* the frameless window.)
*/
function memoryRows(s, petName) {
	const rows = [];
	const totalMsgs = s.messages.sent + s.messages.received;
	if (shouldShowStat(s.companionSeconds)) {
		const streak = s.streak > 1 ? ` ${i18nT("apps.mochi.stats.streak", { streak: s.streak })}` : "";
		rows.push([/* @__PURE__ */ jsx(Clock, { className: "w-4 h-4" }), `${i18nT("apps.mochi.stats.companion_days", { time: formatCompanionTime(s.companionSeconds) })}${streak}`]);
	}
	if (shouldShowStat(totalMsgs)) rows.push([/* @__PURE__ */ jsx(MessageSquare, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.messages", {
		total: fmtNumber(totalMsgs),
		sent: fmtNumber(s.messages.sent),
		received: fmtNumber(s.messages.received),
		name: petName
	})]);
	if (shouldShowStat(s.walkSteps)) rows.push([/* @__PURE__ */ jsx(Footprints, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.walks", {
		count: s.walkSteps,
		n: fmtNumber(s.walkSteps)
	})]);
	if (shouldShowStat(s.screenshots)) rows.push([/* @__PURE__ */ jsx(Camera, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.screenshots", {
		count: s.screenshots,
		n: fmtNumber(s.screenshots)
	})]);
	if (shouldShowStat(s.peeks)) rows.push([/* @__PURE__ */ jsx(Eye, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.peeks", {
		count: s.peeks,
		n: fmtNumber(s.peeks)
	})]);
	if (shouldShowStat(s.drags)) rows.push([/* @__PURE__ */ jsx(MousePointer2, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.drags", {
		count: s.drags,
		n: fmtNumber(s.drags)
	})]);
	if (shouldShowStat(s.thinkingSeconds)) rows.push([/* @__PURE__ */ jsx(Brain, { className: "w-4 h-4" }), formatThinkingTime(s.thinkingSeconds)]);
	if (s.latestActiveTime) rows.push([/* @__PURE__ */ jsx(Moon, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.latest_time", { time: s.latestActiveTime })]);
	if (s.earliestActiveTime) rows.push([/* @__PURE__ */ jsx(Sun, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.earliest_time", { time: s.earliestActiveTime })]);
	if (s.busiestDay && s.busiestDay.messages > 0) rows.push([/* @__PURE__ */ jsx(Flame, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.busiest_day", {
		date: formatDate(s.busiestDay.date),
		count: s.busiestDay.messages,
		n: fmtNumber(s.busiestDay.messages)
	})]);
	if (shouldShowStat(s.longestChat)) rows.push([/* @__PURE__ */ jsx(MessagesSquare, { className: "w-4 h-4" }), i18nT("apps.mochi.stats.longest_chat", {
		count: s.longestChat,
		n: fmtNumber(s.longestChat)
	})]);
	return rows;
}
function MemoriesCard() {
	const { data } = useQuery({
		queryKey: ["mochi", "stats"],
		queryFn: getStats,
		refetchInterval: 6e4
	});
	const { data: settings } = useQuery({
		queryKey: ["mochi", "settings"],
		queryFn: getSettings
	});
	const petName = settings?.petName || "Mochi";
	if (!data) return /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(Brain, { className: "w-5 h-5" }),
		title: i18nT("apps.mochi.mochiPage.no_memories_yet"),
		subtitle: i18nT("apps.mochi.mochiPage.spend_time_with_mochi_to_build_memories")
	});
	const rows = memoryRows(data, petName);
	const topMoods = getTopMoods(data.moods, 3);
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-1",
		children: [rows.map(([icon, text], i) => /* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2.5 px-1 py-1 rounded-md text-[13px]",
			children: [/* @__PURE__ */ jsx("span", {
				className: "shrink-0 text-muted",
				children: icon
			}), /* @__PURE__ */ jsx("span", {
				className: "text-text",
				children: text
			})]
		}, i)), topMoods.length > 0 && /* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2.5 px-1 py-1 text-[13px]",
			children: [
				/* @__PURE__ */ jsx("span", {
					className: "shrink-0 text-muted",
					children: /* @__PURE__ */ jsx(Smile, { className: "w-4 h-4" })
				}),
				/* @__PURE__ */ jsxs("span", {
					className: "text-text shrink-0",
					children: [i18nT("apps.mochi.mochiPage.top_moods"), ":"]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "flex gap-1.5 flex-wrap",
					children: topMoods.map((m) => /* @__PURE__ */ jsxs("span", {
						className: "px-2 py-[1px] rounded-full text-[11px] font-medium bg-bg-elevated border border-border text-text",
						children: [
							moodLabel(m.mood),
							" ",
							fmtPercent(m.percent / 100)
						]
					}, m.mood))
				})
			]
		})]
	});
}
function PinnedCard() {
	const qc = useQueryClient();
	const invalidate = () => qc.invalidateQueries({ queryKey: ["mochi", "pinned"] });
	const { data } = useQuery({
		queryKey: ["mochi", "pinned"],
		queryFn: getPinned,
		refetchInterval: POLL_LIVE_MS
	});
	const unpinMut = useMutation({
		mutationFn: unpinFile,
		onSuccess: invalidate
	});
	const seenMut = useMutation({
		mutationFn: markPinnedSeen,
		onSuccess: invalidate
	});
	const pins = data?.pins ?? [];
	const pinErrors = /* @__PURE__ */ jsxs(Fragment, { children: [unpinMut.isError ? /* @__PURE__ */ jsx(ErrorNotice, {
		className: "mb-2",
		message: unpinMut.error.message
	}) : null, seenMut.isError ? /* @__PURE__ */ jsx(ErrorNotice, {
		className: "mb-2",
		message: seenMut.error.message
	}) : null] });
	if (pins.length === 0) return /* @__PURE__ */ jsxs(Fragment, { children: [pinErrors, /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(Pin, { className: "w-5 h-5" }),
		title: i18nT("apps.mochi.mochiPage.no_pinned_files"),
		subtitle: i18nT("apps.mochi.mochiPage.mochi_pins_files_here_when_you_ask_it_to_watch_o")
	})] });
	return /* @__PURE__ */ jsxs(Fragment, { children: [pinErrors, /* @__PURE__ */ jsx("ul", {
		className: "space-y-2",
		children: pins.map((pin) => /* @__PURE__ */ jsxs("li", {
			className: "flex items-center justify-between rounded-md border border-border px-3 py-2",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "text-[13px] text-text truncate",
					children: [pin.label, pin.updatedAt !== void 0 && /* @__PURE__ */ jsx("span", {
						className: "ml-2 text-[11px] rounded bg-accent-subtle text-accent px-1.5 py-[1px]",
						children: i18nT("apps.mochi.mochiPage.changed")
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "text-[12px] text-muted truncate",
					children: pin.path
				})]
			}), /* @__PURE__ */ jsxs("div", {
				className: "flex gap-2 shrink-0 ml-3 items-center",
				children: [pin.updatedAt !== void 0 && /* @__PURE__ */ jsx("button", {
					onClick: () => seenMut.mutate(pin.path),
					className: "text-[12px] text-muted hover:text-text",
					children: i18nT("apps.mochi.mochiPage.mark_seen")
				}), /* @__PURE__ */ jsx("button", {
					onClick: () => unpinMut.mutate(pin.path),
					title: i18nT("apps.mochi.pinned.unpin"),
					"aria-label": i18nT("apps.mochi.pinned.unpin"),
					className: "opacity-50 hover:opacity-100",
					children: /* @__PURE__ */ jsx(XCircle, { className: "w-4 h-4" })
				})]
			})]
		}, pin.path))
	})] });
}
// src/entries/index.tsx
/**
* The dashboard page (`ui.entry`): Mochi's status, watch list, plan, memories
* and pinned files, the built-in's `/mochi` page.
*/
function MochiRoot() {
	setTransport(useAppApi());
	useLanguageGeneration();
	return /* @__PURE__ */ jsx(MochiPage, {});
}
export { MochiRoot as default };
