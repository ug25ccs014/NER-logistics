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
  feat_reports_title: { en: 'Geo-tagged Field Reports', hi: 'जियो-टैग्ड फील्ड रिपोर्ट', as: 'জিঅ’-টেগ কৰা ক্ষেত্ৰ প্ৰতিবেদন' },
  feat_reports_desc: { en: 'Drivers and field teams can send location-aware incident reports from the ground.', hi: 'ड्राइवर और फील्ड टीमें ज़मीन से स्थान-आधारित घटना रिपोर्ट भेज सकती हैं।', as: 'চালক আৰু ক্ষেত্ৰ দলে মাটিৰ পৰা অৱস্থান-ভিত্তিক ঘটনা প্ৰতিবেদন পঠাব পাৰে।' },
  feat_tracking_title: { en: 'GPS Cargo Tracking', hi: 'GPS कार्गो ट्रैकिंग', as: 'GPS কাৰ্গো ট্ৰেকিং' },
  feat_tracking_desc: { en: 'Keep essential cargo visible while vehicles move through difficult and low-connectivity corridors.', hi: 'वाहनों के कठिन और कम-कनेक्टिविटी वाले मार्गों से गुजरते समय आवश्यक कार्गो पर नज़र रखें।', as: 'যানবাহন কঠিন আৰু কম-সংযোগৰ পথেদি যাওঁতে অত্যাৱশ্যকীয় কাৰ্গোৰ অৱস্থা দেখা ৰাখক।' },
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
  brand_tagline: { en: 'ACCESSIBILITY INTELLIGENCE', hi: 'सुलभता इंटेलिजेंस', as: 'সুলভতা ইণ্টেলিজেন্স' },
  landing_network_label: { en: '01 / NETWORK', hi: '०१ / नेटवर्क', as: '০১ / নেটৱৰ্ক' },
  landing_platform_label: { en: '02 / PLATFORM', hi: '०२ / प्लेटफ़ॉर्म', as: '০২ / প্লেটফৰ্ম' },
  landing_operate_label: { en: '03 / OPERATE', hi: '०३ / संचालन', as: '০৩ / পৰিচালনা' },
  landing_scroll: { en: 'SCROLL TO EXPLORE', hi: 'आगे देखने के लिए स्क्रॉल करें', as: 'অন্বেষণ কৰিবলৈ স্ক্ৰ’ল কৰক' },
  landing_live_network: { en: 'NORTHEAST INDIA / LIVE NETWORK', hi: 'पूर्वोत्तर भारत / लाइव नेटवर्क', as: 'উত্তৰ-পূৰ্ব ভাৰত / লাইভ নেটৱৰ্ক' },
  landing_clear_corridor: { en: 'Clear corridor', hi: 'साफ़ मार्ग', as: 'মুকলি পথ' },
  landing_risk_watch: { en: 'Risk watch', hi: 'जोखिम निगरानी', as: 'বিপদ নিৰীক্ষণ' },
  landing_active_route: { en: 'Active route', hi: 'सक्रिय मार्ग', as: 'সক্ৰিয় পথ' },
  landing_ai_gis_field: { en: 'AI + GIS • FIELD-FIRST', hi: 'AI + GIS • फील्ड-प्रथम', as: 'AI + GIS • ক্ষেত্ৰ-প্ৰথম' },

  // ---- Login / Register page ----
  login_title: { en: 'Sign in to your account', hi: 'अपने खाते में साइन इन करें', as: 'আপোনাৰ একাউণ্টত ছাইন ইন কৰক' },
  login_access_label: { en: '01 / ACCESS', hi: '०१ / प्रवेश', as: '০১ / প্ৰৱেশ' },
  login_register_label: { en: '02 / REGISTER', hi: '०२ / पंजीकरण', as: '০২ / পঞ্জীয়ন' },
  login_field_network: { en: 'AI + GIS / FIELD NETWORK', hi: 'AI + GIS / फील्ड नेटवर्क', as: 'AI + GIS / ক্ষেত্ৰ নেটৱৰ্ক' },
  login_live_network: { en: 'LIVE NETWORK', hi: 'लाइव नेटवर्क', as: 'লাইভ নেটৱৰ্ক' },
  login_road_risk: { en: 'ROAD RISK', hi: 'सड़क जोखिम', as: 'পথৰ বিপদ' },
  login_field_reports: { en: 'FIELD REPORTS', hi: 'फील्ड रिपोर्ट', as: 'ক্ষেত্ৰ প্ৰতিবেদন' },
  region_name: { en: 'North Eastern Region', hi: 'पूर्वोत्तर क्षेत्र', as: 'উত্তৰ-পূৰ্বাঞ্চল' },
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
  role_authority: { en: 'Authority / Government', hi: 'प्राधिकरण / सरकार', as: 'কৰ্তৃপক্ষ / চৰকাৰ' },
  role_driver_desc: { en: 'Route planning, live risk, SOS, report issues', hi: 'मार्ग योजना, लाइव जोखिम, SOS और समस्या रिपोर्ट', as: 'পথ পৰিকল্পনা, লাইভ বিপদ, SOS আৰু সমস্যা প্ৰতিবেদন' },
  role_reporter_desc: { en: 'Ground reporting & ground coordination', hi: 'ज़मीनी रिपोर्टिंग और फील्ड समन्वय', as: 'মাটিৰ প্ৰতিবেদন আৰু ক্ষেত্ৰ সমন্বয়' },
  role_authority_desc: { en: 'District oversight, verification & alerts', hi: 'ज़िला निगरानी, सत्यापन और अलर्ट', as: 'জিলা তত্বাৱধান, সত্যাপন আৰু সতৰ্কবাণী' },
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

  // ---- Additional UI used by secondary tools / overlays ----
  travellers_passed: { en: 'traveller(s) have passed this road.', hi: 'यात्री इस सड़क से गुज़र चुके हैं।', as: 'জন যাত্ৰীয়ে এই পথ পাৰ হৈ গৈছে।' },
  live_forecast: { en: 'LIVE FORECAST', hi: 'लाइव पूर्वानुमान', as: 'লাইভ পূৰ্বানুমান' },
  current_road_data: { en: 'CURRENT ROAD DATA', hi: 'वर्तमान सड़क डेटा', as: 'বৰ্তমান পথৰ তথ্য' },
  unnamed_road: { en: 'Unnamed Road', hi: 'अनाम सड़क', as: 'নাম নথকা পথ' },
  err_geo_unsupported: { en: 'Geolocation not supported in this browser.', hi: 'इस ब्राउज़र में जियोलोकेशन समर्थित नहीं है।', as: 'এই ব্ৰাউজাৰত অৱস্থান সেৱা সমৰ্থিত নহয়।' },
  err_geo_https: { en: 'Live GPS needs a secure connection (https, or localhost) -- most browsers block geolocation otherwise.', hi: 'लाइव GPS के लिए सुरक्षित कनेक्शन (https या localhost) आवश्यक है।', as: 'লাইভ GPS ৰ বাবে সুৰক্ষিত সংযোগ (https বা localhost) প্ৰয়োজন।' },
  shipment_need_identity: { en: 'Fill in your name and phone above (in Nearby Help) first.', hi: 'पहले ऊपर अपना नाम और फ़ोन नंबर (आस-पास सहायता में) भरें।', as: 'প্ৰথমে ওপৰত আপোনাৰ নাম আৰু ফোন নম্বৰ (ওচৰৰ সহায়ত) পূৰণ কৰক।' },
  shipment_required: { en: 'From, To and Date are required.', hi: 'से, तक और तारीख आवश्यक हैं।', as: 'ৰ পৰা, লৈ আৰু তাৰিখ প্ৰয়োজনীয়।' },
  alert_message_required: { en: 'Choose a segment and enter a message.', hi: 'एक सड़क खंड चुनें और संदेश दर्ज करें।', as: 'এটা পথৰ খণ্ড বাছি বাৰ্তা লিখক।' },
  active_alerts: { en: 'Active Alerts', hi: 'सक्रिय अलर्ट', as: 'সক্ৰিয় সতৰ্কবাণী' },
  review_queue: { en: 'Field Report Review Queue', hi: 'फील्ड रिपोर्ट समीक्षा कतार', as: 'ক্ষেত্ৰ প্ৰতিবেদন পৰ্যালোচনা শাৰী' },
  no_field_reports: { en: 'No field reports yet.', hi: 'अभी कोई फील्ड रिपोर्ट नहीं है।', as: 'এতিয়াও কোনো ক্ষেত্ৰ প্ৰতিবেদন নাই।' },
  verified: { en: 'verified', hi: 'सत्यापित', as: 'সত্যাপিত' },
  pending: { en: 'pending', hi: 'लंबित', as: 'বাকী' },
  no_description: { en: 'No description', hi: 'कोई विवरण नहीं', as: 'কোনো বিৱৰণ নাই' },
  field_report_photo: { en: 'Field report photo', hi: 'फील्ड रिपोर्ट फ़ोटो', as: 'ক্ষেত্ৰ প্ৰতিবেদনৰ ফটো' },
  verify: { en: 'Verify', hi: 'सत्यापित करें', as: 'সত্যাপন কৰক' },
  clear: { en: 'Clear', hi: 'साफ़ करें', as: 'পৰিষ্কাৰ কৰক' },
  planned_route: { en: 'Planned route', hi: 'नियोजित मार्ग', as: 'পৰিকল্পিত পথ' },
  forecast_departing: { en: 'Trip risk forecast — departing {time}', hi: 'यात्रा जोखिम पूर्वानुमान — प्रस्थान {time}', as: 'যাত্ৰাৰ বিপদ পূৰ্বানুমান — প্ৰস্থান {time}' },
  forecast_eta: { en: 'Forecast risk at section ETA:', hi: 'खंड के अनुमानित आगमन समय पर जोखिम:', as: 'খণ্ডৰ আনুমানিক আগমনৰ সময়ৰ বিপদ:' },
  forecast_no_segment: { en: "No monitored segment near this route — can't forecast risk for it.", hi: 'इस मार्ग के पास कोई निगरानी वाला खंड नहीं है — इसका जोखिम पूर्वानुमान नहीं किया जा सकता।', as: 'এই পথৰ ওচৰত কোনো নিৰীক্ষণ কৰা খণ্ড নাই — ইয়াৰ বিপদ পূৰ্বানুমান কৰিব নোৱাৰি।' },
  forecast_risk: { en: 'Forecast risk:', hi: 'पूर्वानुमानित जोखिम:', as: 'পূৰ্বানুমান কৰা বিপদ:' },
  loading_forecast: { en: 'Loading forecast...', hi: 'पूर्वानुमान लोड हो रहा है...', as: 'পূৰ্বানুমান লোড হৈ আছে...' },
  finding_route: { en: 'Finding the route...', hi: 'मार्ग खोजा जा रहा है...', as: 'পথ বিচাৰি থকা হৈছে...' },
  could_not_find_route: { en: 'Could not find a route', hi: 'मार्ग नहीं मिला', as: 'পথ বিচাৰি পোৱা নগ’ল' },
  checking_forecast: { en: 'Checking live forecast across', hi: 'लाइव पूर्वानुमान जाँचा जा रहा है', as: 'লাইভ পূৰ্বানুমান পৰীক্ষা কৰা হৈছে' },
  route_sections: { en: 'route sections...', hi: 'मार्ग खंडों पर...', as: 'পথৰ খণ্ডত...' },
  forecast_unavailable: { en: 'Forecast unavailable', hi: 'पूर्वानुमान उपलब्ध नहीं है', as: 'পূৰ্বানুমান উপলব্ধ নহয়' },
  road_identity_description: { en: 'Every road keeps a stable NER Road ID. Unnamed roads can be identified by drivers and field teams, then verified by an authority.', hi: 'हर सड़क का एक स्थिर NER रोड ID होता है। ड्राइवर और फील्ड टीमें अनाम सड़कों की पहचान कर सकती हैं, फिर प्राधिकरण उन्हें सत्यापित करता है।', as: 'প্ৰতিটো পথৰ এটা স্থায়ী NER Road ID থাকে। চালক আৰু ক্ষেত্ৰ দলে নাম নথকা পথ চিনাক্ত কৰিব পাৰে, তাৰ পিছত কৰ্তৃপক্ষই সত্যাপন কৰে।' },
  local_road_name_ph: { en: 'Local/common road name', hi: 'स्थानीय/प्रचलित सड़क नाम', as: 'স্থানীয়/প্ৰচলিত পথৰ নাম' },
  road_landmark_ph: { en: 'Landmark or why this name is used (optional)', hi: 'स्थान-चिह्न या यह नाम क्यों उपयोग होता है (वैकल्पिक)', as: 'চিনাকি স্থান বা এই নাম কিয় ব্যৱহাৰ হয় (বৈকল্পিক)' },
  name_submitted_status: { en: 'Name submitted for verification.', hi: 'नाम सत्यापन के लिए भेज दिया गया।', as: 'নাম সত্যাপনৰ বাবে দাখিল কৰা হ’ল।' },
  road_verified_status: { en: 'Road name verified and activated on the map.', hi: 'सड़क का नाम सत्यापित कर मानचित्र पर सक्रिय कर दिया गया।', as: 'পথৰ নাম সত্যাপন কৰি মেপত সক্ৰিয় কৰা হ’ল।' },
  submission_rejected_status: { en: 'Submission rejected.', hi: 'प्रस्ताव अस्वीकार कर दिया गया।', as: 'দাখিল নাকচ কৰা হ’ল।' },
  new_message: { en: '💬 New message', hi: '💬 नया संदेश', as: '💬 নতুন বাৰ্তা' },
  reply: { en: 'Reply', hi: 'उत्तर दें', as: 'উত্তৰ দিয়ক' },
  messages: { en: 'Messages', hi: 'संदेश', as: 'বাৰ্তা' },
  chat_name_ph: { en: 'Your name (shown to others in chat)', hi: 'आपका नाम (चैट में दूसरों को दिखेगा)', as: 'আপোনাৰ নাম (চেটত আনক দেখুওৱা হ’ব)' },
  find_trips_urgent: { en: '🚀 Find Trips (departing within {h}h)', hi: '🚀 यात्राएँ खोजें ({h} घंटे के भीतर प्रस्थान)', as: '🚀 যাত্ৰা বিচাৰক ({h} ঘণ্টাৰ ভিতৰত প্ৰস্থান)' },
  find_other_trips: { en: '📅 Find Other Trips (next 3 days)', hi: '📅 अन्य यात्राएँ खोजें (अगले 3 दिन)', as: '📅 আন যাত্ৰা বিচাৰক (আগন্তুক ৩ দিন)' },
  road_identity_location: { en: 'Location permission is needed to show unnamed roads near you.', hi: 'आपके पास की अनाम सड़कों को दिखाने के लिए स्थान अनुमति आवश्यक है।', as: 'আপোনাৰ ওচৰৰ নাম নথকা পথ দেখুৱাবলৈ অৱস্থানৰ অনুমতি প্ৰয়োজন।' },
  new_notification: { en: '🔔 New notification', hi: '🔔 नई सूचना', as: '🔔 নতুন জাননী' },
  road_name_submitted: { en: '✓ Thanks — your road name suggestion was submitted for verification.', hi: '✓ धन्यवाद — आपके सड़क नाम सुझाव को सत्यापन के लिए भेज दिया गया है।', as: '✓ ধন্যবাদ — আপোনাৰ পথৰ নামৰ পৰামৰ্শ সত্যাপনৰ বাবে দাখিল কৰা হ’ল।' },
  road_name_help: { en: '🛣️ Help map the NER', hi: '🛣️ NER का मानचित्र बेहतर बनाने में मदद करें', as: '🛣️ NER মেপ উন্নত কৰাত সহায় কৰক' },
  road_name_passed: { en: 'You recently passed', hi: 'आप हाल ही में यहाँ से गुज़रे', as: 'আপুনি অলপতে পাৰ হৈ আহিছে' },
  road_name_unnamed: { en: ', currently shown as an unnamed road.', hi: ', जिसे अभी अनाम सड़क के रूप में दिखाया गया है।', as: ', যিটো বৰ্তমানে নাম নথকা পথ হিচাপে দেখুওৱা হৈছে।' },
  road_name_ph: { en: 'What do locals call this road?', hi: 'स्थानीय लोग इस सड़क को क्या कहते हैं?', as: 'স্থানীয় লোকে এই পথক কি বুলি কয়?' },
  road_name_note_ph: { en: 'Optional landmark/context', hi: 'वैकल्पिक स्थान-चिह्न/संदर्भ', as: 'বৈকল্পিক চিনাকি স্থান/প্ৰসংগ' },
  submit_name: { en: 'Submit Name', hi: 'नाम भेजें', as: 'নাম দাখিল কৰক' },
  not_now: { en: 'Not now', hi: 'अभी नहीं', as: 'এতিয়া নহয়' },
  workspace_back_dashboard: { en: 'Back to Dashboard', hi: 'डैशबोर्ड पर वापस जाएँ', as: 'ডেশ্বব’ৰ্ডলৈ উভতি যাওক' },
  workspace_back_previous: { en: 'Back to previous tool', hi: 'पिछले टूल पर वापस जाएँ', as: 'আগৰ সঁজুলিলৈ উভতি যাওক' },
  map_no_data: { en: 'No data', hi: 'कोई डेटा नहीं', as: 'কোনো তথ্য নাই' },
  map_low_severe: { en: 'Low risk → Severe', hi: 'कम जोखिम → गंभीर', as: 'কম বিপদ → গুৰুতৰ' },
  openstreetmap: { en: 'OpenStreetMap', hi: 'ओपनस्ट्रीटमैप', as: 'অপেনষ্ট্ৰীটমেপ' },
  chat_no_messages: { en: 'No messages yet — say hello, or use a quick reply below.', hi: 'अभी कोई संदेश नहीं है — नमस्ते कहें या नीचे दिए गए त्वरित उत्तर का उपयोग करें।', as: 'এতিয়াও কোনো বাৰ্তা নাই — নমস্কাৰ কওক বা তলৰ দ্ৰুত উত্তৰ ব্যৱহাৰ কৰক।' },
  chat_type_message: { en: 'Type a message...', hi: 'संदेश लिखें...', as: 'বাৰ্তা লিখক...' },
  send: { en: 'Send', hi: 'भेजें', as: 'পঠাওক' },
  no_conversations: { en: 'No conversations yet.', hi: 'अभी कोई बातचीत नहीं है।', as: 'এতিয়াও কোনো কথোপকথন নাই।' },
  nearby_accommodations: { en: 'Nearby Accommodations', hi: 'आस-पास ठहरने की जगहें', as: 'কাষৰীয়া থকাৰ ঠাই' },
  nearby_rest: { en: 'Find places to rest nearby', hi: 'आस-पास आराम करने की जगह खोजें', as: 'ওচৰত জিৰণি ল’বলৈ ঠাই বিচাৰক' },
  shipment_board_title: { en: 'Shipment Board (Merge Cargo, Save Cost)', hi: 'शिपमेंट बोर्ड (कार्गो मिलाएँ, लागत बचाएँ)', as: 'শিপমেণ্ট ব’ৰ্ড (কাৰ্গো একত্ৰিত কৰক, খৰচ বচাওক)' },
  post_trip: { en: '📦 Post an Upcoming Trip', hi: '📦 आगामी यात्रा पोस्ट करें', as: '📦 আগন্তুক যাত্ৰা পোষ্ট কৰক' },
  find_matches: { en: '🔍 Find Matches for This Trip', hi: '🔍 इस यात्रा के लिए मिलान खोजें', as: '🔍 এই যাত্ৰাৰ বাবে মিল বিচাৰক' },
  preview_trip_risk: { en: '🗺️ Preview Trip Risk for Departure Time', hi: '🗺️ प्रस्थान समय के लिए यात्रा जोखिम देखें', as: '🗺️ প্ৰস্থান সময়ৰ বাবে যাত্ৰাৰ বিপদ চাওক' },
  post_to_board: { en: 'Post to Board', hi: 'बोर्ड पर पोस्ट करें', as: 'ব’ৰ্ডত পোষ্ট কৰক' },
  marked_merged: { en: 'Marked merged — removed from the board.', hi: 'मर्ज के रूप में चिह्नित — बोर्ड से हटा दिया गया।', as: 'একত্ৰিত বুলি চিহ্নিত — ব’ৰ্ডৰ পৰা আঁতৰোৱা হ’ল।' },
  contact_merge: { en: '🔔 Contact to Merge', hi: '🔔 मर्ज के लिए संपर्क करें', as: '🔔 একত্ৰিত কৰিবলৈ যোগাযোগ কৰক' },
  cancel: { en: 'Cancel', hi: 'रद्द करें', as: 'বাতিল কৰক' },
  finding_drivers: { en: 'Finding drivers on a similar route...', hi: 'समान मार्ग पर ड्राइवर खोजे जा रहे हैं...', as: 'একে পথত থকা চালক বিচাৰি থকা হৈছে...' },
  live_ai_title: { en: 'Live AI hazard detection', hi: 'लाइव AI खतरा पहचान', as: 'লাইভ AI বিপদ চিনাক্তকৰণ' },
  dashcam_feed: { en: 'Dashcam feed', hi: 'डैशकैम फ़ीड', as: 'ডেশ্বকেম ফীড' },
  detection_mode: { en: 'Detection mode', hi: 'पहचान मोड', as: 'চিনাক্তকৰণ মোড' },
  demo: { en: 'Demo', hi: 'डेमो', as: 'ডেমো' },
  live_camera: { en: 'Live camera', hi: 'लाइव कैमरा', as: 'লাইভ কেমেৰা' },
  gps: { en: 'GPS', hi: 'GPS', as: 'GPS' },
  ai_confidence: { en: 'AI confidence', hi: 'AI विश्वसनीयता', as: 'AI বিশ্বাসযোগ্যতা' },
  hazard_score: { en: 'Hazard score', hi: 'खतरा स्कोर', as: 'বিপদ স্কোৰ' },
  medium_threshold: { en: 'Medium threshold', hi: 'मध्यम सीमा', as: 'মধ্যম সীমা' },
  emergency_threshold: { en: 'Emergency threshold', hi: 'आपातकालीन सीमा', as: 'জৰুৰীকালীন সীমা' },
  confirmed: { en: 'Confirmed', hi: 'पुष्टि की गई', as: 'নিশ্চিত' },
  road_segment: { en: 'Road segment', hi: 'सड़क खंड', as: 'পথৰ খণ্ড' },
  recent_ai_frames: { en: 'Recent AI frames', hi: 'हाल के AI फ़्रेम', as: 'শেহতীয়া AI ফ্ৰেম' },
  no_detections: { en: 'No detections yet.', hi: 'अभी कोई पहचान नहीं हुई।', as: 'এতিয়াও কোনো চিনাক্তকৰণ নাই।' },
  authority_ai_note: { en: 'Authority view: AI events are also written to the normal alert and field-report review pipeline.', hi: 'प्राधिकरण दृश्य: AI घटनाएँ सामान्य अलर्ट और फील्ड-रिपोर्ट समीक्षा प्रक्रिया में भी दर्ज होती हैं।', as: 'কৰ্তৃপক্ষ দৃশ্য: AI ঘটনাসমূহ সাধাৰণ সতৰ্কবাণী আৰু ক্ষেত্ৰ-প্ৰতিবেদন পৰ্যালোচনা প্ৰক্ৰিয়াতো লিখা হয়।' },
  road_identity: { en: 'Road Identity', hi: 'सड़क पहचान', as: 'পথ পৰিচয়' },
  road_identity_help: { en: 'Help identify unnamed roads and use verified road names on future trips.', hi: 'अनाम सड़कों की पहचान में मदद करें और भविष्य की यात्राओं में सत्यापित नामों का उपयोग करें।', as: 'নাম নথকা পথ চিনাক্ত কৰাত সহায় কৰক আৰু ভৱিষ্যৎ যাত্ৰাত সত্যাপিত নাম ব্যৱহাৰ কৰক।' },
  unnamed_nearby_none: { en: 'No unnamed roads detected within 25 km of your current location.', hi: 'आपके वर्तमान स्थान से 25 किमी के भीतर कोई अनाम सड़क नहीं मिली।', as: 'আপোনাৰ বৰ্তমান অৱস্থানৰ ২৫ কিমিৰ ভিতৰত কোনো নাম নথকা পথ পোৱা নগ’ল।' },
  suggested: { en: 'Suggested:', hi: 'सुझाव:', as: 'পৰামৰ্শ:' },
  suggest_confirm_local: { en: 'Suggest / Confirm Local Name', hi: 'स्थानीय नाम सुझाएँ / पुष्टि करें', as: 'স্থানীয় নাম পৰামৰ্শ / নিশ্চিত কৰক' },
  english: { en: 'English', hi: 'अंग्रेज़ी', as: 'ইংৰাজী' },
  assamese: { en: 'Assamese', hi: 'असमिया', as: 'অসমীয়া' },
  hindi: { en: 'Hindi', hi: 'हिंदी', as: 'হিন্দী' },
  local_language: { en: 'Local language', hi: 'स्थानीय भाषा', as: 'স্থানীয় ভাষা' },
  submit_verification: { en: 'Submit for Verification', hi: 'सत्यापन के लिए भेजें', as: 'সত্যাপনৰ বাবে দাখিল কৰক' },
  authority_verification_queue: { en: 'Authority Verification Queue', hi: 'प्राधिकरण सत्यापन कतार', as: 'কৰ্তৃপক্ষ সত্যাপন শাৰী' },
  no_pending_submissions: { en: 'No pending road-name submissions.', hi: 'सड़क-नाम के कोई लंबित प्रस्ताव नहीं हैं।', as: 'পথৰ নামৰ কোনো বাকী থকা দাখিল নাই।' },
  verify_activate: { en: '✓ Verify & Activate', hi: '✓ सत्यापित और सक्रिय करें', as: '✓ সত্যাপন আৰু সক্ৰিয় কৰক' },
  reject: { en: 'Reject', hi: 'अस्वीकार करें', as: 'নাকচ কৰক' },
  no_districts: { en: 'No districts on file.', hi: 'कोई जिला रिकॉर्ड में नहीं है।', as: 'কোনো জিলা ৰেকৰ্ডত নাই।' },
  no_active_alerts: { en: 'No active alerts.', hi: 'कोई सक्रिय अलर्ट नहीं है।', as: 'কোনো সক্ৰিয় সতৰ্কবাণী নাই।' },
  mark_resolved: { en: 'Mark Resolved', hi: 'समाधान के रूप में चिह्नित करें', as: 'সমাধান হোৱা বুলি চিহ্নিত কৰক' },
  create_manual_alert: { en: '+ Create Manual Alert', hi: '+ मैनुअल अलर्ट बनाएँ', as: '+ মেনুৱেল সতৰ্কবাণী সৃষ্টি কৰক' },
  select_segment: { en: 'Select a road segment...', hi: 'सड़क खंड चुनें...', as: 'এটা পথৰ খণ্ড বাছক...' },
  publish_alert: { en: 'Publish Alert', hi: 'अलर्ट प्रकाशित करें', as: 'সতৰ্কবাণী প্ৰকাশ কৰক' },
  no_trips: { en: 'No trips on file.', hi: 'कोई यात्रा रिकॉर्ड में नहीं है।', as: 'কোনো যাত্ৰা ৰেকৰ্ডত নাই।' },

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
