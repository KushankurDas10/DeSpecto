import type { Language, View } from "../shared/contracts.ts";
export const locales = {
  en: {
    opening: "Audit overview",
    count: (target: string, total: number) => `${target}. The audit found ${total} ${total === 1 ? "issue" : "issues"}.`,
    file: (file: string, start: number, end: number) => `See ${file}, ${start === end ? `line ${start}` : `lines ${start} to ${end}`}.`,
    view: (view: View) => `See the ${view} screenshot.`,
  },
  hi: {
    opening: "ऑडिट का सारांश",
    count: (target: string, total: number) => `${target} के ऑडिट में ${total} समस्याएँ मिलीं।`,
    file: (file: string, start: number, end: number) => `${file} में ${start === end ? `पंक्ति ${start}` : `पंक्तियाँ ${start} से ${end}`} देखें।`,
    view: (view: View) => `${view === "mobile" ? "मोबाइल" : "डेस्कटॉप"} स्क्रीनशॉट देखें।`,
  },
  te: {
    opening: "ఆడిట్ సారాంశం",
    count: (target: string, total: number) => `${target} ఆడిట్‌లో ${total} సమస్యలు కనిపించాయి.`,
    file: (file: string, start: number, end: number) => `${file}లో ${start === end ? `${start}వ పంక్తిని` : `${start} నుంచి ${end} వరకు పంక్తులను`} చూడండి.`,
    view: (view: View) => `${view === "mobile" ? "మొబైల్" : "డెస్క్‌టాప్"} స్క్రీన్‌షాట్ చూడండి.`,
  },
};

const translations: Record<string, Record<"hi" | "te", [string, string]>> = {
  "Low text contrast": {
    hi: ["टेक्स्ट का कंट्रास्ट कम है", "टेक्स्ट और उसकी पृष्ठभूमि के रंगों में पर्याप्त अंतर नहीं है, जिससे उसे पढ़ना मुश्किल हो सकता है।"],
    te: ["వచనానికి తగిన కాంట్రాస్ట్ లేదు", "వచనం, నేపథ్యం రంగుల మధ్య తేడా తక్కువగా ఉండటంతో చదవడం కష్టంగా ఉండవచ్చు."],
  },
  "Missing project README": {
    hi: ["प्रोजेक्ट का README गायब है", "पैकेज में स्टार्ट कमांड है, लेकिन सेटअप या चलाने का तरीका बताने वाला README मौजूद नहीं है।"],
    te: ["ప్రాజెక్ట్ README లేదు", "ప్యాకేజీలో స్టార్ట్ కమాండ్ ఉంది. సెటప్ లేదా అమలు విధానాన్ని వివరించే README లేదు."],
  },
  "Invalid package manifest": {
    hi: ["अमान्य पैकेज फ़ाइल", "पैकेज मैनेजर को package.json में एक मान्य JSON ऑब्जेक्ट चाहिए।"],
    te: ["చెల్లని ప్యాకేజీ ఫైల్", "ప్యాకేజీ మేనేజర్‌కు package.jsonలో చెల్లుబాటు అయ్యే JSON ఆబ్జెక్ట్ అవసరం."],
  },
  "Broken README link": {
    hi: ["README में टूटा लिंक", "README जिस फ़ाइल या फ़ोल्डर का लिंक देता है, वह जाँचे गए संस्करण में मौजूद नहीं है।"],
    te: ["READMEలో పనిచేయని లింక్", "README సూచించే ఫైల్ లేదా ఫోల్డర్ పరిశీలించిన వెర్షన్‌లో లేదు."],
  },
  "Missing page title": {
    hi: ["पेज का शीर्षक गायब है", "ब्राउज़र टैब और सहायक तकनीक को पहचान के लिए पेज शीर्षक की ज़रूरत होती है।"],
    te: ["పేజీ శీర్షిక లేదు", "బ్రౌజర్ ట్యాబ్‌లు, సహాయక సాంకేతికత పేజీని గుర్తించడానికి శీర్షికను ఉపయోగిస్తాయి."],
  },
  "Missing mobile viewport setting": {
    hi: ["मोबाइल व्यूपोर्ट सेटिंग गायब है", "मोबाइल ब्राउज़र डेस्कटॉप लेआउट को छोटा कर सकता है, जिससे टेक्स्ट पढ़ना मुश्किल हो जाता है।"],
    te: ["మొబైల్ వ్యూపోర్ట్ సెట్టింగ్ లేదు", "మొబైల్ బ్రౌజర్ డెస్క్‌టాప్ లేఅవుట్‌ను చిన్నదిగా చేసి, చదవడం కష్టతరం చేయవచ్చు."],
  },
  "Content extends beyond the viewport": {
    hi: ["सामग्री स्क्रीन से बाहर जाती है", "पेज स्क्रीन से ज़्यादा चौड़ा है, इसलिए उसे दाएँ-बाएँ स्क्रॉल करना पड़ सकता है।"],
    te: ["కంటెంట్ స్క్రీన్ వెడల్పును దాటుతోంది", "పేజీ స్క్రీన్ కంటే వెడల్పుగా ఉంది. కంటెంట్ చూడటానికి అడ్డంగా స్క్రోల్ చేయాల్సి రావచ్చు."],
  },
  "Image missing alternative text": {
    hi: ["चित्र का वैकल्पिक टेक्स्ट गायब है", "स्क्रीन रीडर को इस चित्र का वर्णन देने के लिए वैकल्पिक टेक्स्ट चाहिए।"],
    te: ["చిత్రానికి ప్రత్యామ్నాయ వచనం లేదు", "స్క్రీన్ రీడర్‌కు ఈ చిత్రాన్ని వివరించడానికి ప్రత్యామ్నాయ వచనం అవసరం."],
  },
  "Form field missing a label": {
    hi: ["फ़ॉर्म फ़ील्ड का लेबल गायब है", "इस फ़ील्ड का नाम सहायक तकनीक को स्पष्ट रूप से उपलब्ध नहीं है।"],
    te: ["ఫారమ్ ఫీల్డ్‌కు లేబుల్ లేదు", "ఈ ఫీల్డ్ పేరు సహాయక సాంకేతికతకు స్పష్టంగా అందుబాటులో లేదు."],
  },
};

export function builtInTranslation(title: string, language: "hi" | "te"): [string, string] | null {
  const known = Object.hasOwn(translations, title) && translations[title][language];
  if (known) return known;

  const script = /^Undeclared script: (.+)$/.exec(title)?.[1];
  if (script) return language === "hi"
    ? [`${script} स्क्रिप्ट घोषित नहीं है`, "README में दी गई स्क्रिप्ट रूट की package.json फ़ाइल में नहीं है।"]
    : [`${script} స్క్రిప్ట్ ప్రకటించలేదు`, "READMEలో సూచించిన స్క్రిప్ట్ ప్రధాన package.jsonలో లేదు."];

  const entry = /^Missing entry point for (.+)$/.exec(title)?.[1];
  if (entry) return language === "hi"
    ? [`${entry} की शुरुआती फ़ाइल गायब है`, "स्क्रिप्ट जिस फ़ाइल को चलाती है, वह जाँचे गए संस्करण में नहीं मिली।"]
    : [`${entry} ప్రారంభ ఫైల్ లేదు`, "స్క్రిప్ట్ అమలు చేసే ఫైల్ పరిశీలించిన వెర్షన్‌లో కనిపించలేదు."];
  return null;
}
