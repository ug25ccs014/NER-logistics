import React, { createContext, useContext, useEffect, useState } from 'react';

// Mirrors api/i18n.py -- keep the language codes and UI_STRINGS keys
// in sync with that file if you add a language or a translated field.
export const LANGUAGES = [
  ['en', 'English'],
  ['hi', 'हिन्दी (Hindi)'],
  ['as', 'অসমীয়া (Assamese)'],
];

// Static UI chrome strings (not fetched from the backend, since these
// don't depend on any data). Report/alert type labels instead come
// from the API's *_label fields, translated server-side by i18n.py.
const UI_STRINGS = {
  report_issue: { en: 'Report an Issue', hi: 'समस्या दर्ज करें', as: 'সমস্যা প্ৰতিবেদন কৰক' },
  submit_report: { en: 'Submit Report', hi: 'रिपोर्ट भेजें', as: 'প্ৰতিবেদন দাখিল কৰক' },
  cancel: { en: 'Cancel', hi: 'रद्द करें', as: 'বাতিল কৰক' },
  add_photo: { en: 'Add photo (optional)', hi: 'फ़ोटो जोड़ें (वैकल्पिक)', as: 'ফটো যোগ কৰক (বৈকল্পিক)' },
  queued_offline: {
    en: 'No connection -- saved on this device. Will send automatically once you\'re back online.',
    hi: 'कनेक्शन नहीं है -- इस डिवाइस पर सहेजा गया। ऑनलाइन होते ही अपने आप भेज दिया जाएगा।',
    as: 'সংযোগ নাই -- এই ডিভাইচত সংৰক্ষণ কৰা হ\'ল। অনলাইন হ\'লেই স্বয়ংক্ৰিয়ভাৱে পঠোৱা হ\'ব।',
  },
  pending_sync: { en: 'pending sync', hi: 'सिंक होना बाकी', as: 'ছিংক বাকী আছে' },

  // ---- Landing page ----
  brand_name: { en: 'NER Logistics Intelligence', hi: 'एनईआर लॉजिस्टिक्स इंटेलिजेंस', as: 'এনইআৰ লজিষ্টিক ইণ্টেলিজেন্স' },
  sign_in: { en: 'Sign in', hi: 'साइन इन करें', as: 'ছাইন ইন কৰক' },
  eyebrow: { en: 'AI + GIS for North East India', hi: 'पूर्वोत्तर भारत के लिए AI + GIS', as: 'উত্তৰ-পূৰ্ব ভাৰতৰ বাবে AI + GIS' },
  hero_title_start: { en: 'Keep essential goods moving through', hi: 'आवश्यक वस्तुओं की आवाजाही बनाए रखें', as: 'অত্যাৱশ্যকীয় সামগ্ৰীৰ চলাচল বজাই ৰাখক' },
  hero_title_accent: { en: 'India\'s toughest terrain', hi: 'भारत के सबसे कठिन इलाकों में', as: 'ভাৰতৰ আটাইতকৈ কঠিন ভূখণ্ডত' },
  hero_desc: {
    en: 'A logistics accessibility platform that predicts road disruptions, tracks cargo, and coordinates field reports in real time — built for the North Eastern Region\'s landslides, floods, and low-connectivity zones.',
    hi: 'एक लॉजिस्टिक्स एक्सेसिबिलिटी प्लेटफ़ॉर्म जो सड़क व्यवधानों का पूर्वानुमान लगाता है, कार्गो को ट्रैक करता है, और वास्तविक समय में फील्ड रिपोर्ट का समन्वय करता है — पूर्वोत्तर क्षेत्र के भूस्खलन, बाढ़ और कम-कनेक्टिविटी वाले क्षेत्रों के लिए बनाया गया।',
    as: 'এখন লজিষ্টিক সুলভতা প্লেটফৰ্ম যিয়ে পথৰ ব্যাঘাতৰ পূৰ্বানুমান কৰে, কাৰ্গো ট্ৰেক কৰে, আৰু প্ৰকৃত সময়ত ক্ষেত্ৰ প্ৰতিবেদন সমন্বয় কৰে — উত্তৰ-পূৰ্বাঞ্চলৰ মাটি স্খলন, বান পানী আৰু কম-সংযোগৰ অঞ্চলৰ বাবে নিৰ্মিত।',
  },
  get_started: { en: 'Get Started', hi: 'शुरू करें', as: 'আৰম্ভ কৰক' },
  see_how: { en: 'See how it works', hi: 'यह कैसे काम करता है देखें', as: 'ই কেনেকৈ কাম কৰে চাওক' },
  stat_segments: { en: 'Road segments mapped', hi: 'मैप किए गए सड़क खंड', as: 'মেপ কৰা পথৰ খণ্ড' },
  stat_languages: { en: 'Languages supported', hi: 'समर्थित भाषाएँ', as: 'সমৰ্থিত ভাষা' },
  stat_monitoring: { en: 'Risk monitoring', hi: 'जोखिम निगरानी', as: 'বিপদ নিৰীক্ষণ' },
  features_heading: { en: 'Everything a control room needs, in one place', hi: 'एक कंट्रोल रूम को जो कुछ भी चाहिए, एक ही जगह पर', as: 'এটা নিয়ন্ত্ৰণ কক্ষলৈ প্ৰয়োজনীয় সকলো, এটাই ঠাইত' },
  features_sub: {
    en: 'Built around the North East\'s real operating conditions, not a generic logistics template.',
    hi: 'पूर्वोत्तर की वास्तविक परिचालन स्थितियों के अनुरूप बनाया गया, न कि किसी सामान्य लॉजिस्टिक्स टेम्पलेट पर आधारित।',
    as: 'উত্তৰ-পূৰ্বাঞ্চলৰ প্ৰকৃত পৰিচালনাৰ পৰিস্থিতিৰ ওপৰত ভিত্তি কৰি নিৰ্মিত, কোনো সাধাৰণ লজিষ্টিক টেমপ্লেট নহয়।',
  },
  feat_map_title: { en: 'Live Accessibility Map', hi: 'लाइव एक्सेसिबिलिटी मैप', as: 'লাইভ সুলভতা মেপ' },
  feat_map_desc: {
    en: 'Real-time road, bridge, and district connectivity status across the North Eastern Region, updated as conditions change.',
    hi: 'पूर्वोत्तर क्षेत्र में सड़क, पुल और जिला कनेक्टिविटी की वास्तविक समय स्थिति, स्थितियाँ बदलने पर अपडेट होती है।',
    as: 'উত্তৰ-পূৰ্বাঞ্চল জুৰি পথ, দলং, আৰু জিলাৰ সংযোগৰ প্ৰকৃত-সময়ৰ অৱস্থা, পৰিস্থিতি সলনি হোৱাৰ লগে লগে আপডেট হয়।',
  },
  feat_predict_title: { en: 'Disruption Prediction', hi: 'व्यवधान पूर्वानुमान', as: 'ব্যাঘাত পূৰ্বানুমান' },
  feat_predict_desc: {
    en: 'Rainfall and terrain-slope risk scoring flags landslide- and flood-prone stretches before they become impassable.',
    hi: 'वर्षा और भू-भाग-ढलान जोखिम स्कोरिंग भूस्खलन और बाढ़-प्रवण क्षेत्रों को अगम्य होने से पहले चिह्नित करती है।',
    as: 'বৰষুণ আৰু ভূখণ্ডৰ ঢাল বিপদ মূল্যায়নে মাটি স্খলন আৰু বান পানী প্ৰৱণ অংশ অগম্য হোৱাৰ আগতেই চিনাক্ত কৰে।',
  },
  feat_route_title: { en: 'Fastest vs Safest Routing', hi: 'सबसे तेज़ बनाम सबसे सुरक्षित मार्ग', as: 'আটাইতকৈ ক্ষীপ্ৰ বনাম আটাইতকৈ নিৰাপদ পথ' },
  feat_route_desc: {
    en: 'AI-assisted alternate-route suggestions weigh real road geometry against current risk, not just distance.',
    hi: 'AI-सहायता प्राप्त वैकल्पिक-मार्ग सुझाव केवल दूरी नहीं, बल्कि वास्तविक सड़क ज्यामिति की तुलना वर्तमान जोखिम से करते हैं।',
    as: 'AI-সহায়ক বিকল্প-পথৰ পৰামৰ্শে কেৱল দূৰত্বহে নহয়, প্ৰকৃত পথৰ জ্যামিতিক গঠন বৰ্তমানৰ বিপদৰ সৈতে তুলনা কৰে।',
  },
  feat_field_title: { en: 'Geo-tagged Field Reports', hi: 'जियो-टैग की गई फील्ड रिपोर्ट', as: 'ভূ-টেগ কৰা ক্ষেত্ৰ প্ৰতিবেদন' },
  feat_field_desc: {
    en: 'Field officers and drivers upload photos and incident reports straight from the ground, even with no signal.',
    hi: 'फील्ड अधिकारी और ड्राइवर बिना नेटवर्क के भी, सीधे ज़मीन से फ़ोटो और घटना रिपोर्ट अपलोड करते हैं।',
    as: 'ক্ষেত্ৰ বিষয়া আৰু চালকসকলে চিগনেল নথকাতো, পোনপটীয়াকৈ মাটিৰ পৰা ফটো আৰু ঘটনাৰ প্ৰতিবেদন আপলোড কৰে।',
  },
  feat_gps_title: { en: 'GPS Cargo Tracking', hi: 'GPS कार्गो ट्रैकिंग', as: 'GPS কাৰ্গো ট্ৰেকিং' },
  feat_gps_desc: {
    en: 'Live tracking for vehicles carrying medicine, food, construction material, and agricultural produce.',
    hi: 'दवा, भोजन, निर्माण सामग्री और कृषि उपज ले जाने वाले वाहनों की लाइव ट्रैकिंग।',
    as: 'ঔষধ, খাদ্য, নিৰ্মাণ সামগ্ৰী আৰু কৃষি উৎপাদন কঢ়িয়াই নিয়া বাহনৰ লাইভ ট্ৰেকিং।',
  },
  feat_offline_title: { en: 'Multilingual & Offline-first', hi: 'बहुभाषी और ऑफ़लाइन-प्राथमिकता', as: 'বহুভাষিক আৰু অফলাইন-প্ৰথম' },
  feat_offline_desc: {
    en: 'English, Hindi, and Assamese support, with field reports queued locally and synced once connectivity returns.',
    hi: 'अंग्रेज़ी, हिंदी और असमिया समर्थन, फील्ड रिपोर्ट स्थानीय रूप से सहेजी जाती हैं और कनेक्टिविटी लौटने पर सिंक होती हैं।',
    as: 'ইংৰাজী, হিন্দী আৰু অসমীয়া সমৰ্থন, ক্ষেত্ৰ প্ৰতিবেদন স্থানীয়ভাৱে ৰখা হয় আৰু সংযোগ ঘূৰি অহাৰ পিছত ছিংক হয়।',
  },
  ready_heading: { en: 'Ready to see the map?', hi: 'मैप देखने के लिए तैयार हैं?', as: 'মেপখন চাবলৈ সাজু নেকি?' },
  ready_sub: {
    en: 'Sign in as a driver, field reporter, or authority to get started.',
    hi: 'शुरू करने के लिए ड्राइवर, फील्ड रिपोर्टर या प्राधिकरण के रूप में साइन इन करें।',
    as: 'আৰম্ভ কৰিবলৈ চালক, ক্ষেত্ৰ প্ৰতিবেদক, বা কৰ্তৃপক্ষ হিচাপে ছাইন ইন কৰক।',
  },
  sign_in_create: { en: 'Sign in / Create account', hi: 'साइन इन करें / खाता बनाएं', as: 'ছাইন ইন কৰক / একাউণ্ট সৃষ্টি কৰক' },
  footer_text: {
    en: 'NER Logistics Accessibility Intelligence Platform — built for the North Eastern Region.',
    hi: 'एनईआर लॉजिस्टिक्स एक्सेसिबिलिटी इंटेलिजेंस प्लेटफ़ॉर्म — पूर्वोत्तर क्षेत्र के लिए बनाया गया।',
    as: 'এনইআৰ লজিষ্টিক সুলভতা ইণ্টেলিজেন্স প্লেটফৰ্ম — উত্তৰ-পূৰ্বাঞ্চলৰ বাবে নিৰ্মিত।',
  },

  // ---- Login / Register page ----
  login_title: { en: 'Sign in to your account', hi: 'अपने खाते में साइन इन करें', as: 'আপোনাৰ একাউণ্টত ছাইন ইন কৰক' },
  register_title: { en: 'Create an account to get started', hi: 'शुरू करने के लिए खाता बनाएं', as: 'আৰম্ভ কৰিবলৈ এটা একাউণ্ট সৃষ্টি কৰক' },
  create_account_tab: { en: 'Create account', hi: 'खाता बनाएं', as: 'একাউণ্ট সৃষ্টি কৰক' },
  full_name: { en: 'Full name', hi: 'पूरा नाम', as: 'সম্পূৰ্ণ নাম' },
  full_name_ph: { en: 'Your name', hi: 'आपका नाम', as: 'আপোনাৰ নাম' },
  phone_number: { en: 'Phone number', hi: 'फ़ोन नंबर', as: 'ফোন নম্বৰ' },
  password: { en: 'Password', hi: 'पासवर्ड', as: 'পাছৱৰ্ড' },
  password_ph_register: { en: 'At least 8 characters', hi: 'कम से कम 8 अक्षर', as: 'কমেও ৮টা আখৰ' },
  password_ph_login: { en: 'Your password', hi: 'आपका पासवर्ड', as: 'আপোনাৰ পাছৱৰ্ড' },
  role_prompt: { en: 'I am a...', hi: 'मैं हूँ...', as: 'মই...' },
  passkey_label: { en: 'Organization passkey', hi: 'संगठन पासकी', as: 'প্ৰতিষ্ঠানৰ পাছকী' },
  passkey_ph: { en: 'Provided by your department', hi: 'आपके विभाग द्वारा प्रदान किया गया', as: 'আপোনাৰ বিভাগে প্ৰদান কৰা' },
  passkey_note: {
    en: 'Field official and authority accounts need a passkey issued by your department to prevent unverified sign-ups from getting elevated access.',
    hi: 'फील्ड अधिकारी और प्राधिकरण खातों को आपके विभाग द्वारा जारी एक पासकी की आवश्यकता होती है, ताकि असत्यापित साइन-अप को उच्च पहुँच मिलने से रोका जा सके।',
    as: 'ক্ষেত্ৰ বিষয়া আৰু কৰ্তৃপক্ষৰ একাউণ্টৰ বাবে আপোনাৰ বিভাগে জাৰি কৰা এটা পাছকী প্ৰয়োজন, যাতে অসত্যাপিত ছাইন-আপে উচ্চ প্ৰৱেশাধিকাৰ নাপায়।',
  },
  please_wait: { en: 'Please wait...', hi: 'कृपया प्रतीक्षा करें...', as: 'অনুগ্ৰহ কৰি অপেক্ষা কৰক...' },
  back_to_home: { en: '← Back to home', hi: '← होम पर वापस जाएँ', as: '← গৃহলৈ ঘূৰি যাওক' },

  // ---- Top bar / navigation chrome ----
  nav_back: { en: 'Back', hi: 'पीछे', as: 'উলটা' },
  nav_forward: { en: 'Forward', hi: 'आगे', as: 'আগবাঢ়ক' },
  breadcrumb_home: { en: 'Home', hi: 'होम', as: 'গৃহ' },
  account_fallback: { en: 'Account', hi: 'खाता', as: 'একাউণ্ট' },
  log_out: { en: 'Log out', hi: 'लॉग आउट', as: 'লগ আউট' },
  topbar_subtitle_driver: {
    en: 'Real-time accessibility & disruption monitoring',
    hi: 'वास्तविक समय पहुँच और व्यवधान निगरानी',
    as: 'প্ৰকৃত-সময়ৰ সুলভতা আৰু ব্যাঘাত নিৰীক্ষণ',
  },
  topbar_subtitle_field_reporter: {
    en: 'Ground reporting & field coordination',
    hi: 'ज़मीनी रिपोर्टिंग और फील्ड समन्वय',
    as: 'মাটিৰ প্ৰতিবেদন আৰু ক্ষেত্ৰ সমন্বয়',
  },
  topbar_subtitle_authority: {
    en: 'District oversight, verification & alerts',
    hi: 'ज़िला निगरानी, सत्यापन और अलर्ट',
    as: 'জিলা তত্বাৱধান, সত্যাপন আৰু সতৰ্কবাণী',
  },

  // ---- Home screen greeting (HeroBanner) ----
  hero_greeting_driver_title: { en: 'Where are you headed?', hi: 'आप कहाँ जा रहे हैं?', as: 'আপুনি কোনফালে যাব বিচাৰিছে?' },
  hero_greeting_driver_subtitle: {
    en: 'Plan a route, or jump into any tool below.',
    hi: 'एक मार्ग की योजना बनाएं, या नीचे दिए गए किसी भी टूल में जाएं।',
    as: 'এটা পথৰ পৰিকল্পনা কৰক, বা তলৰ যিকোনো সঁজুলিলৈ যাওক।',
  },
  hero_greeting_field_reporter_title: {
    en: 'What are you seeing on the ground?',
    hi: 'आप ज़मीन पर क्या देख रहे हैं?',
    as: 'আপুনি মাটিত কি দেখি আছে?',
  },
  hero_greeting_field_reporter_subtitle: {
    en: 'Log a report, or jump into any tool below.',
    hi: 'एक रिपोर्ट दर्ज करें, या नीचे दिए गए किसी भी टूल में जाएं।',
    as: 'এটা প্ৰতিবেদন লিখক, বা তলৰ যিকোনো সঁজুলিলৈ যাওক।',
  },
  hero_greeting_authority_title: {
    en: 'Here is the network right now.',
    hi: 'यह रहा नेटवर्क अभी की स्थिति में।',
    as: 'এইখন এতিয়াৰ নেটৱৰ্কৰ অৱস্থা।',
  },
  hero_greeting_authority_subtitle: {
    en: 'Open a tool below to dig in.',
    hi: 'गहराई से देखने के लिए नीचे कोई टूल खोलें।',
    as: 'গভীৰভাৱে চাবলৈ তলত এটা সঁজুলি খোলক।',
  },

  // ---- Home screen tool grid (config/tools.js) ----
  tool_ai_dashcam_label: { en: 'Live Dashcam AI', hi: 'लाइव डैशकैम AI', as: 'লাইভ ডেশ্বকেম AI' },
  tool_ai_dashcam_desc: {
    en: 'Detect landslides, floods and road hazards from live camera frames and alert the response chain.',
    hi: 'लाइव कैमरा फ़्रेम से भूस्खलन, बाढ़ और सड़क खतरों का पता लगाएँ और प्रतिक्रिया टीम को अलर्ट करें।',
    as: 'লাইভ কেমেৰা ফ্ৰেমৰ পৰা ভূমিস্খলন, বান আৰু পথৰ বিপদ চিনাক্ত কৰি প্ৰতিক্ৰিয়া শৃংখলাক সতৰ্ক কৰক।',
  },
  tool_route_label: { en: 'Route & Ride', hi: 'मार्ग और सवारी', as: 'পথ আৰু যাত্ৰা' },
  tool_route_desc: {
    en: 'Search a route, see road risk along it, then start or simulate your ride.',
    hi: 'एक मार्ग खोजें, उसके साथ सड़क जोखिम देखें, फिर अपनी सवारी शुरू करें या सिम्युलेट करें।',
    as: 'এটা পথ সন্ধান কৰক, তাৰ সৈতে পথৰ বিপদ চাওক, তাৰ পিছত আপোনাৰ যাত্ৰা আৰম্ভ বা অনুকৰণ কৰক।',
  },
  tool_field_reports_label: { en: 'Field Reports', hi: 'फील्ड रिपोर्ट', as: 'ক্ষেত্ৰ প্ৰতিবেদন' },
  tool_field_reports_desc: {
    en: 'Report a landslide, flood or road damage, and see recent reports nearby.',
    hi: 'भूस्खलन, बाढ़ या सड़क क्षति की रिपोर्ट करें, और आस-पास की हाल की रिपोर्ट देखें।',
    as: 'মাটি স্খলন, বান পানী বা পথৰ ক্ষতিৰ প্ৰতিবেদন কৰক, আৰু কাষৰীয়া শেহতীয়া প্ৰতিবেদন চাওক।',
  },
  tool_sos_label: { en: 'Live Location & SOS', hi: 'लाइव लोकेशन और SOS', as: 'লাইভ অৱস্থান আৰু SOS' },
  tool_sos_desc: {
    en: 'Share your live location with others and send an emergency alert.',
    hi: 'अपना लाइव लोकेशन दूसरों के साथ साझा करें और एक आपातकालीन अलर्ट भेजें।',
    as: 'আপোনাৰ লাইভ অৱস্থান আনৰ সৈতে শ্বেয়াৰ কৰক আৰু এটা জৰুৰীকালীন সতৰ্কবাণী পঠাওক।',
  },
  tool_stays_label: { en: 'Nearby Stays', hi: 'आस-पास ठहरने की जगहें', as: 'কাষৰীয়া থকাৰ ঠাই' },
  tool_stays_desc_driver: {
    en: 'Find accommodation to rest at along your route.',
    hi: 'अपने मार्ग पर आराम करने के लिए ठहरने की जगह खोजें।',
    as: 'আপোনাৰ পথত জিৰণি লবলৈ থকাৰ ঠাই বিচাৰক।',
  },
  tool_stays_desc_reporter: {
    en: 'Find accommodation to rest at nearby.',
    hi: 'आस-पास आराम करने के लिए ठहरने की जगह खोजें।',
    as: 'ওচৰতে জিৰণি লবলৈ থকাৰ ঠাই বিচাৰক।',
  },
  tool_shipments_label: { en: 'Shipment Board', hi: 'शिपमेंट बोर्ड', as: 'শিপমেণ্ট তালিকা' },
  tool_shipments_desc_driver: {
    en: 'Post spare capacity or find another driver to merge cargo with.',
    hi: 'खाली क्षमता पोस्ट करें या कार्गो साझा करने के लिए किसी अन्य ड्राइवर को खोजें।',
    as: 'অতিৰিক্ত ক্ষমতা পোষ্ট কৰক বা কাৰ্গো একত্ৰিত কৰিবলৈ আন এজন চালক বিচাৰক।',
  },
  tool_shipments_desc_reporter: {
    en: 'Help drivers merge cargo along overlapping routes.',
    hi: 'ओवरलैपिंग मार्गों पर ड्राइवरों को कार्गो मर्ज करने में मदद करें।',
    as: 'অভাৰলেপিং পথত চালকসকলক কাৰ্গো একত্ৰিত কৰাত সহায় কৰক।',
  },
  tool_inbox_label: { en: 'Messages', hi: 'संदेश', as: 'বাৰ্তা' },
  tool_inbox_desc_driver: {
    en: 'Chat with other drivers, field reporters and authority.',
    hi: 'अन्य ड्राइवरों, फील्ड रिपोर्टरों और प्राधिकरण के साथ चैट करें।',
    as: 'আন চালক, ক্ষেত্ৰ প্ৰতিবেদক আৰু কৰ্তৃপক্ষৰ সৈতে চেট কৰক।',
  },
  tool_inbox_desc_reporter: {
    en: 'Chat with drivers and authority.',
    hi: 'ड्राइवरों और प्राधिकरण के साथ चैट करें।',
    as: 'চালক আৰু কৰ্তৃপক্ষৰ সৈতে চেট কৰক।',
  },
  tool_inbox_desc_authority: {
    en: 'Message drivers and field reporters directly.',
    hi: 'ड्राइवरों और फील्ड रिपोर्टरों को सीधे संदेश भेजें।',
    as: 'চালক আৰু ক্ষেত্ৰ প্ৰতিবেদকক পোনপটীয়াকৈ বাৰ্তা পঠাওক।',
  },
  tool_alerts_label: { en: 'Alerts', hi: 'अलर्ट', as: 'সতৰ্কবাণী' },
  tool_alerts_desc: {
    en: 'Active disruption and risk alerts across the network.',
    hi: 'नेटवर्क भर में सक्रिय व्यवधान और जोखिम अलर्ट।',
    as: 'নেটৱৰ্ক জুৰি সক্ৰিয় ব্যাঘাত আৰু বিপদৰ সতৰ্কবাণী।',
  },
  tool_network_label: { en: 'Network Overview', hi: 'नेटवर्क अवलोकन', as: 'নেটৱৰ্ক অৱলোকন' },
  tool_network_desc: {
    en: 'See risk scoring across the entire monitored road network and district status.',
    hi: 'पूरे निगरानी वाले सड़क नेटवर्क और ज़िला स्थिति में जोखिम स्कोरिंग देखें।',
    as: 'সমগ্ৰ নিৰীক্ষণ কৰা পথৰ নেটৱৰ্ক আৰু জিলাৰ অৱস্থাৰ বিপদ মূল্যায়ন চাওক।',
  },
  tool_review_label: { en: 'Review Queue', hi: 'समीक्षा कतार', as: 'পৰ্যালোচনা শাৰী' },
  tool_review_desc: {
    en: 'Verify field reports submitted by drivers and field reporters.',
    hi: 'ड्राइवरों और फील्ड रिपोर्टरों द्वारा सबमिट की गई फील्ड रिपोर्ट सत्यापित करें।',
    as: 'চালক আৰু ক্ষেত্ৰ প্ৰতিবেদকে দাখিল কৰা ক্ষেত্ৰ প্ৰতিবেদন সত্যাপন কৰক।',
  },
  tool_manage_alerts_label: { en: 'Manage Alerts', hi: 'अलर्ट प्रबंधित करें', as: 'সতৰ্কবাণী পৰিচালনা কৰক' },
  tool_manage_alerts_desc: {
    en: 'Publish and manage disruption alerts for monitored segments.',
    hi: 'निगरानी किए गए खंडों के लिए व्यवधान अलर्ट प्रकाशित और प्रबंधित करें।',
    as: 'নিৰীক্ষণ কৰা খণ্ডৰ বাবে ব্যাঘাত সতৰ্কবাণী প্ৰকাশ আৰু পৰিচালনা কৰক।',
  },
  tool_trips_label: { en: 'Trips Oversight', hi: 'यात्रा निगरानी', as: 'যাত্ৰা তত্বাৱধান' },
  tool_trips_desc: {
    en: 'Monitor in-progress, planned and completed trips district-wide.',
    hi: 'ज़िले भर में चल रही, नियोजित और पूर्ण यात्राओं की निगरानी करें।',
    as: 'জিলা জুৰি চলি থকা, পৰিকল্পিত আৰু সম্পূৰ্ণ যাত্ৰা নিৰীক্ষণ কৰক।',
  },

  // ---- Shared risk-level words (used across route results, map
  // popups, network/district views -- one place to keep them
  // consistent everywhere a risk_level like "moderate"/"high" is
  // shown to a person instead of used as a data value). ----
  risk_level_low: { en: 'Low', hi: 'कम', as: 'কম' },
  risk_level_moderate: { en: 'Moderate', hi: 'मध्यम', as: 'মধ্যম' },
  risk_level_high: { en: 'High', hi: 'उच्च', as: 'উচ্চ' },
  risk_level_severe: { en: 'Severe', hi: 'गंभीर', as: 'গুৰুতৰ' },
  risk_level_not_yet_scored: { en: 'Not yet scored', hi: 'अभी स्कोर नहीं हुआ', as: 'এতিয়াও মূল্যায়ন কৰা নাই' },
  risk_level_na: { en: 'N/A', hi: 'लागू नहीं', as: 'প্ৰযোজ্য নহয়' },

  // ---- Route & Ride (RouteSearch.jsx) ----
  route_search_title: { en: 'Search a Route (any location)', hi: 'एक मार्ग खोजें (कोई भी स्थान)', as: 'এটা পথ সন্ধান কৰক (যিকোনো ঠাই)' },
  route_from_ph: { en: 'From (e.g. Dimapur, Nagaland)', hi: 'से (जैसे दीमापुर, नागालैंड)', as: 'ৰ পৰা (যেনে দিমাপুৰ, নাগাল্যাণ্ড)' },
  route_to_ph: { en: 'To (e.g. Kohima, Nagaland)', hi: 'तक (जैसे कोहिमा, नागालैंड)', as: 'লৈ (যেনে কোহিমা, নাগাল্যাণ্ড)' },
  find_route_btn: { en: 'Find Route', hi: 'मार्ग खोजें', as: 'পথ সন্ধান কৰক' },
  status_finding_route: { en: 'Finding route...', hi: 'मार्ग खोजा जा रहा है...', as: 'পথ বিচাৰি থকা হৈছে...' },
  err_enter_from_to: { en: 'Enter both From and To first.', hi: 'पहले से और तक दोनों दर्ज करें।', as: 'প্ৰথমে দুয়োটা \'ৰ পৰা\' আৰু \'লৈ\' লিখক।' },
  option_prefix: { en: 'Option', hi: 'विकल्प', as: 'বিকল্প' },
  fastest_tag: { en: ' (fastest)', hi: ' (सबसे तेज़)', as: ' (আটাইতকৈ ক্ষীপ্ৰ)' },
  risk_no_data: { en: 'No risk data (unmonitored road)', hi: 'कोई जोखिम डेटा नहीं (अनिगरानी सड़क)', as: 'কোনো বিপদ তথ্য নাই (অনিৰীক্ষিত পথ)' },
  // {level} and {score} are replaced by the caller after translation,
  // so word order stays natural for each language.
  risk_level_score_template: { en: '{level} risk (score {score})', hi: '{level} जोखिम (स्कोर {score})', as: '{level} বিপদ (স্কোৰ {score})' },
  passes_segments_template: { en: 'passes {n} monitored segment(s)', hi: '{n} निगरानी किए गए खंड(ों) से गुज़रता है', as: '{n} নিৰীক্ষণ কৰা খণ্ডৰ মাজেৰে যায়' },
  popup_risk_label: { en: 'Risk:', hi: 'जोखिम:', as: 'বিপদ:' },
  popup_no_data: {
    en: 'No risk data for this stretch (unmonitored road)',
    hi: 'इस हिस्से के लिए कोई जोखिम डेटा नहीं (अनिगरानी सड़क)',
    as: 'এই অংশৰ বাবে কোনো বিপদ তথ্য নাই (অনিৰীক্ষিত পথ)',
  },

  // ---- Ride Panel (RidePanel.jsx) ----
  start_ride_btn: { en: '📍 Start Ride (Live GPS)', hi: '📍 सवारी शुरू करें (लाइव GPS)', as: '📍 যাত্ৰা আৰম্ভ কৰক (লাইভ GPS)' },
  simulate_ride_btn: { en: '▶ Simulate Ride (Demo)', hi: '▶ सवारी सिम्युलेट करें (डेमो)', as: '▶ যাত্ৰা অনুকৰণ কৰক (ডেমো)' },
  stop_btn: { en: '⏹ Stop', hi: '⏹ रोकें', as: '⏹ বন্ধ কৰক' },
  arrived_label: { en: 'Arrived', hi: 'पहुँच गए', as: 'উপনীত হৈছে' },
  min_remaining_km_left_template: {
    en: 'min remaining · {km} km left',
    hi: 'मिनट शेष · {km} किमी शेष',
    as: 'মিনিট বাকী · {km} কিমি বাকী',
  },
  live_gps_mode_label: {
    en: '📍 Live GPS tracking (your real device location)',
    hi: '📍 लाइव GPS ट्रैकिंग (आपके वास्तविक डिवाइस का स्थान)',
    as: '📍 লাইভ GPS ট্ৰেকিং (আপোনাৰ প্ৰকৃত ডিভাইচৰ অৱস্থান)',
  },
  simulated_ride_mode_label: {
    en: '▶ Simulated ride (for demo purposes)',
    hi: '▶ सिम्युलेटेड सवारी (डेमो प्रयोजनों के लिए)',
    as: '▶ অনুকৰণ কৰা যাত্ৰা (ডেমো উদ্দেশ্যৰ বাবে)',
  },
  geo_not_supported_alert: {
    en: 'Geolocation not supported in this browser.',
    hi: 'इस ब्राउज़र में जियोलोकेशन समर्थित नहीं है।',
    as: 'এই ব্ৰাউজাৰত অৱস্থান জনাৰ সুবিধা সমৰ্থিত নহয়।',
  },
  geo_needs_https_alert: {
    en: 'Live GPS needs a secure connection (https, or localhost) -- most browsers block geolocation otherwise.',
    hi: 'लाइव GPS को एक सुरक्षित कनेक्शन (https, या localhost) की आवश्यकता है -- अन्यथा अधिकांश ब्राउज़र जियोलोकेशन को ब्लॉक कर देते हैं।',
    as: 'লাইভ GPS ৰ বাবে এটা সুৰক্ষিত সংযোগ (https, বা localhost) লাগে -- অন্যথা বেছিভাগ ব্ৰাউজাৰে অৱস্থান অৱৰোধ কৰে।',
  },
  geo_error_alert_template: {
    en: 'Could not get your location: {err}. Check that location permission is granted for this site.',
    hi: 'आपका स्थान प्राप्त नहीं हो सका: {err}। जांचें कि इस साइट के लिए स्थान अनुमति दी गई है।',
    as: 'আপোনাৰ অৱস্থান পোৱা নগ\'ল: {err}। এই ছাইটৰ বাবে অৱস্থানৰ অনুমতি দিয়া হৈছে নে নাই পৰীক্ষা কৰক।',
  },

  // ---- Field Report Form (FieldReportForm.jsx) ----
  report_issue_title: { en: 'Report a Road Issue', hi: 'सड़क समस्या दर्ज करें', as: 'পথৰ সমস্যা প্ৰতিবেদন কৰক' },
  report_type_landslide: { en: 'Landslide', hi: 'भूस्खलन', as: 'মাটি স্খলন' },
  report_type_flood: { en: 'Flood', hi: 'बाढ़', as: 'বান পানী' },
  report_type_road_damage: { en: 'Road damage', hi: 'सड़क क्षति', as: 'পথৰ ক্ষতি' },
  report_type_bridge_damage: { en: 'Bridge damage', hi: 'पुल क्षति', as: 'দলঙৰ ক্ষতি' },
  report_type_congestion: { en: 'Congestion / traffic', hi: 'यातायात जाम', as: 'যানবাহন যাম' },
  report_type_clear: {
    en: 'Now clear (previously reported issue resolved)',
    hi: 'अब साफ़ (पहले रिपोर्ट की गई समस्या हल हो गई)',
    as: 'এতিয়া মুকলি (আগতে প্ৰতিবেদন কৰা সমস্যা সমাধান হ\'ল)',
  },
  describe_seeing_ph: { en: "Describe what you're seeing...", hi: 'आप जो देख रहे हैं उसका वर्णन करें...', as: 'আপুনি কি দেখি আছে বৰ্ণনা কৰক...' },
  your_name_optional_ph: { en: 'Your name (optional)', hi: 'आपका नाम (वैकल्पिक)', as: 'আপোনাৰ নাম (বৈকল্পিক)' },
  locating_you: { en: 'Locating you...', hi: 'आपका स्थान खोजा जा रहा है...', as: 'আপোনাৰ অৱস্থান বিচাৰি থকা হৈছে...' },
  gps_unavailable_click_map: {
    en: 'GPS not available -- click on the map to set the location.',
    hi: 'GPS उपलब्ध नहीं है -- स्थान सेट करने के लिए मानचित्र पर क्लिक करें।',
    as: 'GPS উপলব্ধ নহয় -- অৱস্থান ঠিক কৰিবলৈ মেপত ক্লিক কৰক।',
  },
  location_set_from_gps: {
    en: 'Location set from GPS -- click the map to adjust if needed.',
    hi: 'GPS से स्थान सेट किया गया -- आवश्यकता होने पर मानचित्र पर क्लिक करके समायोजित करें।',
    as: 'GPS ৰ পৰা অৱস্থান ঠিক কৰা হ\'ল -- প্ৰয়োজন হ\'লে মেপত ক্লিক কৰি সলনি কৰক।',
  },
  could_not_get_gps_click_map: {
    en: 'Could not get GPS -- click on the map to set the location.',
    hi: 'GPS प्राप्त नहीं हो सका -- स्थान सेट करने के लिए मानचित्र पर क्लिक करें।',
    as: 'GPS পোৱা নগ\'ল -- অৱস্থান ঠিক কৰিবলৈ মেপত ক্লিক কৰক।',
  },
  set_location_first: {
    en: 'Set a location first (GPS or click the map).',
    hi: 'पहले एक स्थान सेट करें (GPS या मानचित्र पर क्लिक करें)।',
    as: 'প্ৰথমে এটা অৱস্থান ঠিক কৰক (GPS বা মেপত ক্লিক কৰক)।',
  },
  could_not_submit_template: {
    en: 'Could not submit: {err}',
    hi: 'सबमिट नहीं हो सका: {err}',
    as: 'দাখিল কৰিব পৰা নগ\'ল: {err}',
  },

  // ---- Field Reports List (FieldReportsList.jsx) ----
  recent_field_reports_template: { en: 'Recent Field Reports ({n})', hi: 'हाल की फील्ड रिपोर्ट ({n})', as: 'শেহতীয়া ক্ষেত্ৰ প্ৰতিবেদন ({n})' },
  reports_pending_sync_template: {
    en: '{n} report(s) waiting to sync (saved on this device, no connection yet)',
    hi: '{n} रिपोर्ट सिंक होने की प्रतीक्षा में (इस डिवाइस पर सहेजी गई, अभी कनेक्शन नहीं है)',
    as: '{n} প্ৰতিবেদন ছিংক হ\'বলৈ বাকী (এই ডিভাইচত সংৰক্ষিত, এতিয়াও সংযোগ নাই)',
  },
  no_field_reports_yet: { en: 'No field reports yet.', hi: 'अभी तक कोई फील्ड रिपोर्ट नहीं।', as: 'এতিয়ালৈকে কোনো ক্ষেত্ৰ প্ৰতিবেদন নাই।' },
  verified_tag: { en: 'verified', hi: 'सत्यापित', as: 'সত্যাপিত' },
  unverified_tag: { en: 'unverified', hi: 'असत्यापित', as: 'অসত্যাপিত' },
  near_prefix: { en: 'Near:', hi: 'निकट:', as: 'ওচৰত:' },
  by_reporter_template: { en: 'By {name}', hi: '{name} द्वारा', as: '{name} ৰ দ্বাৰা' },
  anonymous_reporter: { en: 'Anonymous', hi: 'अज्ञात', as: 'অজ্ঞাত' },
  corroborated_by_template: {
    en: 'Corroborated by {n} other report(s)',
    hi: '{n} अन्य रिपोर्ट द्वारा पुष्टि की गई',
    as: 'আন {n} প্ৰতিবেদনৰ দ্বাৰা সমৰ্থিত',
  },

  // ---- Live Location & SOS (LiveLocationSos.jsx) ----
  sos_title: { en: 'Nearby Help (Live Location)', hi: 'आस-पास सहायता (लाइव लोकेशन)', as: 'ওচৰৰ সহায় (লাইভ অৱস্থান)' },
  your_name_required_ph: { en: 'Your name *', hi: 'आपका नाम *', as: 'আপোনাৰ নাম *' },
  phone_required_ph: { en: 'Phone number *', hi: 'फ़ोन नंबर *', as: 'ফোন নম্বৰ *' },
  stop_sharing_btn: { en: 'Stop Sharing', hi: 'साझा करना बंद करें', as: 'শ্বেয়াৰ কৰা বন্ধ কৰক' },
  start_sharing_btn: { en: 'Start Sharing My Location', hi: 'मेरा स्थान साझा करना शुरू करें', as: 'মোৰ অৱস্থান শ্বেয়াৰ কৰা আৰম্ভ কৰক' },
  not_sharing: { en: 'Not sharing.', hi: 'साझा नहीं किया जा रहा।', as: 'শ্বেয়াৰ কৰা হোৱা নাই।' },
  sos_gps_not_available: { en: 'GPS not available.', hi: 'GPS उपलब्ध नहीं है।', as: 'GPS উপলব্ধ নহয়।' },
  sharing_as_template: { en: 'Sharing live location as {name}.', hi: '{name} के रूप में लाइव लोकेशन साझा की जा रही है।', as: '{name} হিচাপে লাইভ অৱস্থান শ্বেয়াৰ কৰা হৈছে।' },
  could_not_get_location_template: {
    en: 'Could not get location: {err}',
    hi: 'स्थान प्राप्त नहीं हो सका: {err}',
    as: 'অৱস্থান পোৱা নগ\'ল: {err}',
  },
  im_stuck_btn: { en: "🆘 I'm Stuck — Find Nearby Help", hi: '🆘 मैं फंस गया हूँ — आस-पास सहायता खोजें', as: '🆘 মই আটক হৈ আছোঁ — ওচৰৰ সহায় বিচাৰক' },
  searching_nearby: { en: 'Searching nearby...', hi: 'आस-पास खोजा जा रहा है...', as: 'ওচৰত বিচাৰি থকা হৈছে...' },
  no_one_nearby: {
    en: 'No one else nearby right now (within 25km, active in the last 15 min).',
    hi: 'अभी आस-पास कोई और नहीं है (25 किमी के भीतर, पिछले 15 मिनट में सक्रिय)।',
    as: 'এতিয়া ওচৰত আন কোনো নাই (25 কিমিৰ ভিতৰত, শেহতীয়া 15 মিনিটত সক্ৰিয়)।',
  },
  role_field_official: { en: 'Field Official', hi: 'फील्ड अधिकारी', as: 'ক্ষেত্ৰ বিষয়া' },
  role_driver: { en: 'Driver', hi: 'ड्राइवर', as: 'চালক' },
  km_away_template: { en: '{km} km away', hi: '{km} किमी दूर', as: '{km} কিমি দূৰত' },
  notify_btn: { en: '🔔 Notify', hi: '🔔 सूचित करें', as: '🔔 জনাওক' },
  chat_btn: { en: '💬 Chat', hi: '💬 चैट', as: '💬 চেট' },
  view_on_map_btn: { en: 'View on Map', hi: 'मानचित्र पर देखें', as: 'মেপত চাওক' },
  dismiss_btn: { en: 'Dismiss', hi: 'खारिज करें', as: 'বাতিল কৰক' },
  notified_person_template: { en: 'Notified {name}.', hi: '{name} को सूचित किया गया।', as: '{name} ক জনোৱা হ\'ল।' },
  could_not_notify_template: {
    en: 'Could not send notification: {err}',
    hi: 'सूचना नहीं भेजी जा सकी: {err}',
    as: 'জাননী পঠাব পৰা নগ\'ল: {err}',
  },
  someone_needs_help_heading: { en: '🆘 Someone nearby needs help', hi: '🆘 आस-पास किसी को सहायता चाहिए', as: '🆘 ওচৰত কাৰোবাৰ সহায় লাগে' },
  err_enter_name_phone: {
    en: 'Enter your name and phone number first.',
    hi: 'पहले अपना नाम और फ़ोन नंबर दर्ज करें।',
    as: 'প্ৰথমে আপোনাৰ নাম আৰু ফোন নম্বৰ লিখক।',
  },
};

const LanguageContext = createContext(null);
const STORAGE_KEY = 'ner_lang';

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(STORAGE_KEY) || 'en');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const t = (key) => UI_STRINGS[key]?.[lang] ?? UI_STRINGS[key]?.en ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
