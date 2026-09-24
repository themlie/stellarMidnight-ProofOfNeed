const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

const translations = [
  ['Midnight Burs', 'Midnight Scholarship'],
  ['ZK Gizlilik Burs Platformu', 'ZK Privacy Scholarship Platform'],
  ['Gelirini söylemeden burs kazan.', 'Win scholarships without revealing your income.'],
  ['Sıfır bilgi kanıtıyla burs uygunluğunu ispatla. Gelir verisi tarayıcından dışarı sızmaz, vakıf bile gerçek maaşını göremez.', 'Prove your scholarship eligibility with zero-knowledge proofs. Your income data never leaks from your browser, not even the foundation sees your actual salary.'],
  ['Lace Cüzdanını Bağla', 'Connect Lace Wallet'],
  ['Gelirin gizli kalır', 'Your income stays private'],
  ['Aile gelirin <span class="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">private witness</span> olarak yalnızca tarayıcının belleğinde tutulur — sunucuya, vakfa veya blokzincire asla gönderilmez.', "Your family income is kept as a <span class=\"font-mono text-xs bg-gray-100 px-1 py-0.5 rounded\">private witness</span> only in your browser's memory — it is never sent to the server, foundation, or blockchain."],
  ['Kanıt lokalde üretilir', 'Proof is generated locally'],
  ['<span class="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">check_eligibility(income)</span> devresi cihazında çalışır; uygunluğun matematiksel bir ZK-SNARK kanıtına dönüşür.', 'The <span class="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">check_eligibility(income)</span> circuit runs on your device; your eligibility turns into a mathematical ZK-SNARK proof.'],
  ['Ağa sadece kanıt gider', 'Only the proof goes to the network'],
  ['Vakıf, gelirini bilmeden \\\'bu öğrenci eşiğin altında\\\' gerçeğini doğrular. Ne gördüğü olur, ne kimse.', "The foundation verifies the fact 'this student is below the threshold' without knowing your income. Nobody sees anything."],
  ['Öğrenci Başvurusu', 'Student Application'],
  ['Vakıf Yönetimi', 'Foundation Management'],
  ['Başvuru Listesi', 'Application List'],
  ['Gelirini kimseye söylemeden uygunluğunu kanıtla.', 'Prove your eligibility without telling anyone your income.'],
  ["Gelir <span class=\"font-bold\">private witness</span> 'tır: yalnızca bu tarayıcıda tutulur, kanıt üretilirken bile ağa gönderilmez. Ağa yalnızca matematiksel kanıt (proof) ve anonim nullifier iletilir.", 'Income is a <span class="font-bold">private witness</span>: kept only in this browser, never sent to the network even when generating a proof. Only the mathematical proof and an anonymous nullifier are transmitted.'],
  ['Aile Geliri (TL)', 'Family Income ($)'],
  ["e-Devlet'ten Çek", 'Fetch Verified Data'],
  ['Örn: 8000', 'e.g. 8000'],
  ['Bu değer tarayıcınızdan asla çıkmaz. Sunucuya, vakfa veya blokzincire gönderilmez.', 'This value never leaves your browser. It is not sent to the server, foundation, or blockchain.'],
  ['Vakıf Sözleşmesi', 'Foundation Contract'],
  ['Vakıf sözleşmesi seçin', 'Select a foundation contract'],
  ['Eğitim Vakfı 2024 (Eşik: 10.000 TL)', 'Education Foundation 2024 (Threshold: $10,000)'],
  ['(Opsiyonel) Sözleşme adresini elle girin — 0x...', '(Optional) Enter contract address manually — 0x...'],
  ['Bursa Başvur / Uygunluğumu Kanıtla', 'Apply for Scholarship / Prove Eligibility'],
  ['Vakıf Yönetimi — Sözleşme Dağıtımı', 'Foundation Management — Contract Deployment'],
  ['Burs eşiğini belirle ve sözleşmeyi Midnight ağına yükle.', 'Set the scholarship threshold and deploy the contract to the Midnight network.'],
  ['Burs Eşiği (TL) — Maksimum Gelir Sınırı', 'Scholarship Threshold ($) — Maximum Income Limit'],
  ['Bu değer sözleşmenin constructor argümanıdır ve <span class="font-bold">Public State</span> olarak blokzincire yazılır — gizli değildir, öğrenciler bunun altında olduklarını kanıtlar.', 'This value is the constructor argument of the contract and is written to the blockchain as <span class="font-bold">Public State</span> — it is not secret, students prove they are below this.'],
  ['Sözleşmeyi Başlat (Deploy)', 'Deploy Contract'],
  ['SON DAĞITIMLAR', 'RECENT DEPLOYMENTS'],
  ['eşik 15.000 ₺', 'threshold $15,000'],
  ['eşik 10.000 ₺', 'threshold $10,000'],
  ['Ağa gönderilen kanıtlar — Midnight üzerinde doğrulanır.', 'Proofs sent to the network — verified on Midnight.'],
  ['Gelir verisi sisteme hiç girmediği için bu listede gelir bilgisi yer <span class="font-bold">almaz</span> — yalnızca anonim nullifier, ZK kanıt durumu ve başvuru zamanı görünür.', 'Since income data never enters the system, this list does <span class="font-bold">NOT</span> contain income information — only the anonymous nullifier, ZK proof status, and application time are visible.'],
  ['Zaman', 'Time'],
  ['Öğrenci (Nullifier)', 'Student (Nullifier)'],
  ['Kanıt Durumu', 'Proof Status'],
  ['İşlem', 'Action'],
  ['Bursu Gönder', 'Send Scholarship'],
  ['Geliştirici (Dev) Modu', 'Developer (Dev) Mode'],
  ['Arka plandaki ZK-SNARK kodlarını gizle/göster.', 'Hide/show background ZK-SNARK codes.'],
  ['ZK Devre Denetçisi', 'ZK Circuit Auditor'],
  ['Lokal Çalışıyor', 'Running Locally'],
  ['Gizli', 'Secret'],
  ['Açık', 'Public'],
  ['Ağa gider', 'To Network'],
  ['sadece cihazda', 'only on device'],
  ['ZK Rehberi', 'ZK Guide'],
  ['Claude destekli asistan', 'AI Assistant'],
  ['Soru sor... (geliriniz asla istenmez)', 'Ask a question... (your income is never requested)'],
  ['Merhaba! ZK kanıtları, Midnight Network ve gizlilik hakkında soru sorabilirsin.', 'Hello! You can ask questions about ZK proofs, Midnight Network, and privacy.'],
  ['ZK proof nedir?', 'What is a ZK proof?'],
  ['Gelirim gizli mi kalacak?', 'Will my income stay private?'],
  ['Burs sözleşmesi nasıl çalışır?', 'How does the contract work?']
];

for (const [tr, en] of translations) {
  // Replace all occurrences
  html = html.split(tr).join(en);
}

// Add the TR/EN toggle button in the header
const headerRegex = /(<div class="flex items-center gap-3">)/;
const toggleBtn = `
      <div class="flex bg-dim rounded-lg p-1 mr-2 text-xs font-bold shadow-sm">
        <button id="lang-en" onclick="setLang('en')" class="px-3 py-1.5 rounded-md bg-white text-brand-brown shadow-sm transition-all">EN</button>
        <button id="lang-tr" onclick="setLang('tr')" class="px-3 py-1.5 rounded-md text-dim hover:text-brand-brown transition-all">TR</button>
      </div>
`;
html = html.replace(headerRegex, '$1' + toggleBtn);

fs.writeFileSync(filePath, html);
console.log("Translation applied!");
