// Extend window interface for Midnight DApp Connector
declare global {
  interface Window {
    midnight?: {
      mnLace?: {
        enable: () => Promise<any>;
      };
    };
  }
}

(window as any).openRoleModal = function() {
  const modal = document.getElementById('role-modal');
  const content = document.getElementById('role-modal-content');
  if (modal && content) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    // slight delay for animation
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      content.classList.remove('translate-y-4');
    }, 10);
  }
};

(window as any).closeRoleModal = function() {
  const modal = document.getElementById('role-modal');
  const content = document.getElementById('role-modal-content');
  if (modal && content) {
    modal.classList.add('opacity-0');
    content.classList.add('translate-y-4');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }, 300);
  }
};

let userRole = 'student';

(window as any).selectRoleAndConnect = async function(role: string) {
  userRole = role;
  (window as any).closeRoleModal();
  await (window as any).connectWallet();
};

// Global UI functions to replace inline scripts in index.html
(window as any).connectWallet = async function() {
  const btn = document.getElementById('btn-nav-connect');
  let originalHTML = '';
  if (btn) {
    originalHTML = btn.innerHTML;
    const textConnecting = currentLang === 'tr' ? 'Bağlanıyor...' : 'Connecting...';
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${textConnecting}`;
    btn.classList.add('opacity-80', 'cursor-not-allowed');
  }

  try {
    // Try to find the correct DApp Connector API
    const midnightKeys = window.midnight ? Object.keys(window.midnight) : [];
    
    // Find the right object to enable
    let dAppConnector;
    if (midnightKeys.length > 0) {
      // Midnight eklentisi rastgele (UUID) bir isimle kendini ekliyor, ilkini alıyoruz
      const walletKey = midnightKeys[0];
      const walletProvider = (window.midnight as any)[walletKey];
      
      // Midnight API v4.x ve sonrasında enable() yerine connect(networkId) kullanılıyor
      if (typeof walletProvider.connect === 'function') {
        dAppConnector = await walletProvider.connect('preview');
      } else if (typeof walletProvider.enable === 'function') {
        dAppConnector = await walletProvider.enable();
      } else {
        alert(currentLang === 'tr' ? "Cüzdan bulundu ancak bağlantı metodu bulunamadı." : "Wallet found but connect method is missing.");
        enableDemoMode();
        return;
      }
    } else {
      alert(currentLang === 'tr' ? "Cüzdan sayfaya erişemiyor." : "Wallet extension cannot access the page.");
      enableDemoMode();
      return;
    }
    if (typeof dAppConnector.state === 'function') {
      const state = await dAppConnector.state();
      const address = state.address || "0x000...0000";
      const shortAddress = address.substring(0, 6) + "..." + address.substring(address.length - 4);
      document.getElementById('wallet-address-display')!.innerText = shortAddress;
    } else {
      // Midnight v4.x API (yeni versiyon) - getDustAddress veya getUnshieldedAddresses kullanılıyor
      let addressStr = currentLang === 'tr' ? "Bağlandı" : "Connected";
      try {
        if (typeof dAppConnector.getDustAddress === 'function') {
          const dustAddr = await dAppConnector.getDustAddress();
          addressStr = typeof dustAddr === 'string' ? dustAddr : String(dustAddr);
        } else if (typeof dAppConnector.getUnshieldedAddresses === 'function') {
          const addrs = await dAppConnector.getUnshieldedAddresses();
          if (addrs && addrs.length > 0) {
            addressStr = typeof addrs[0] === 'string' ? addrs[0] : String(addrs[0]);
          }
        }
      } catch (err) {
        console.error("Adres alınırken hata:", err);
      }
      
      const shortAddress = addressStr.length > 10 
        ? addressStr.substring(0, 6) + "..." + addressStr.substring(addressStr.length - 4) 
        : addressStr;
      
      document.getElementById('wallet-address-display')!.innerText = shortAddress;
    }
    
    enableDemoMode(); // Switch UI state
  } catch (error) {
    console.error("Cüzdan bağlantısı reddedildi veya hata oluştu:", error);
    alert(currentLang === 'tr' ? "Cüzdan bağlantısı başarısız oldu: " : "Wallet connection failed: " + (error as Error).message);
  } finally {
    if (btn) {
      btn.innerHTML = originalHTML;
      btn.classList.remove('opacity-80', 'cursor-not-allowed');
    }
  }
};

(window as any).disconnectWallet = function() {
  document.getElementById('view-landing')!.classList.remove('hidden');
  document.getElementById('view-dashboard')!.classList.add('hidden');
  document.getElementById('view-dashboard')!.classList.remove('grid');
  
  document.getElementById('btn-nav-connect')!.classList.remove('hidden');
  document.getElementById('wallet-connected')!.classList.add('hidden');
  document.getElementById('wallet-connected')!.classList.remove('flex');
};

(window as any).switchTab = function(tabId: string) {
  // Hide all content
  document.getElementById('content-student')!.classList.add('hidden');
  document.getElementById('content-foundation')!.classList.add('hidden');
  document.getElementById('content-list')!.classList.add('hidden');
  
  // Reset all tabs
  const tabs = ['student', 'foundation', 'list'];
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t)!;
    el.classList.remove('border-brand-brown', 'text-[#1A1A1A]');
    el.classList.add('border-transparent', 'text-dim');
  });

  // Show selected content
  document.getElementById('content-' + tabId)!.classList.remove('hidden');
  document.getElementById('content-' + tabId)!.classList.add('flex');
  
  // Highlight selected tab
  const selected = document.getElementById('tab-' + tabId)!;
  selected.classList.add('border-brand-brown', 'text-[#1A1A1A]');
  selected.classList.remove('border-transparent', 'text-dim');
};

(window as any).fetchEDevlet = function() {
  const btn = document.getElementById('btn-edevlet')!;
  const input = document.getElementById('income-input') as HTMLInputElement;
  const helper = document.getElementById('income-helper')!;

  const textFetching = currentLang === 'tr' ? "Çekiliyor..." : "Fetching...";
  btn.innerHTML = `<svg class="animate-spin h-3 w-3 inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${textFetching}`;
  
  setTimeout(() => {
    input.value = "8500";
    input.classList.add("bg-[#F5FBF5]", "border-[#4ADE80]");
    const textSuccess = currentLang === 'tr' ? "e-Devlet kriptografik imzası başarıyla doğrulandı." : "e-Gov cryptographic signature successfully verified.";
    const textSub = currentLang === 'tr' ? "Bu değer tarayıcınızdan asla çıkmaz." : "This value never leaves your browser.";
    helper.innerHTML = `<span class="text-[#2E7D32] font-medium flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> ${textSuccess}</span> ${textSub}`;
    
    const textVerified = currentLang === 'tr' ? "Doğrulandı" : "Verified";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-1"><polyline points="20 6 9 17 4 12"></polyline></svg> ${textVerified}`;
    btn.classList.add("bg-[#E8F5E9]", "text-[#2E7D32]", "border-[#2E7D32]/20");
    btn.classList.remove("bg-[#e5f6fd]", "text-[#0288D1]");
  }, 1500);
};

(window as any).generateProof = function() {
  const btn = document.getElementById('btn-proof')!;
  const originalHTML = btn.innerHTML;
  
  const textGenerating = currentLang === 'tr' ? "ZK Kanıtı Oluşturuluyor..." : "Generating ZK Proof...";
  btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${textGenerating}`;
  
  const incomeInput = document.getElementById('income-input') as HTMLInputElement;
  const income = incomeInput.value || '0';
  const isEligible = parseInt(income) <= 10000;

  // Terminal UI updates
  document.getElementById('zk-code-block')!.classList.add('hidden');
  const terminal = document.getElementById('zk-terminal-block')!;
  terminal.classList.remove('hidden');
  const logs = document.getElementById('zk-logs')!;
  logs.innerHTML = ''; // Clear previous logs
  
  const addLog = (msg: string, delay: number) => {
    return new Promise(resolve => {
      setTimeout(() => {
        logs.innerHTML += `<div>> ${msg}</div>`;
        terminal.scrollTop = terminal.scrollHeight;
        resolve(true);
      }, delay);
    });
  };

  (async () => {
    await addLog("Derlenmiş sözleşme (burs_eligibility.compact) yükleniyor...", 200);
    await addLog("Lokal Proving Server ile bağlantı kuruluyor...", 600);
    await addLog("Veriler doğrulanıyor (Gizli Veri: Gelir)...", 800);
    await addLog(`ZK-SNARK kanıtı üretiliyor: income (${income}) <= threshold (10000)`, 1500);
    
    if (isEligible) {
      await addLog("Kanıt BAŞARIYLA oluşturuldu! Ağa (Midnight) gönderiliyor...", 800);
      await addLog("Ağ onayı (Blockfrost/Lace) bekleniyor...", 1200);
      await addLog("İşlem onaylandı! Durum: Verified", 500);
      
      const textSuccessBtn = currentLang === 'tr' ? "Başarılı! Kanıt Ağa Gönderildi" : "Success! Proof Sent to Network";
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${textSuccessBtn}`;
      btn.classList.add('bg-green-600', 'hover:bg-green-700');
      btn.classList.remove('bg-brand-brown', 'hover-bg-brand-brown');

      // Add to list
      const table = document.getElementById('applications-table')!;
      const now = new Date();
      const timeString = `${now.getDate()}.${now.getMonth()+1}.${now.getFullYear()} ${now.getHours()}:${now.getMinutes()}`;
      const hash = "0x" + Math.random().toString(16).slice(2, 10) + "..." + Math.random().toString(16).slice(2, 10);
      
      const newRow = `
        <tr class="border-b border-dim hover:bg-gray-50">
          <td class="py-4 pl-2 text-sm text-dim">${timeString}</td>
          <td class="py-4 font-mono text-sm">${hash}</td>
          <td class="py-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E8F5E9] text-[#2E7D32]">
              Verified on Midnight
            </span>
          </td>
          <td class="py-4 text-right pr-2">
            <button class="border border-dim rounded-md px-3 py-1.5 text-xs font-medium hover:bg-gray-50 flex items-center gap-1 ml-auto">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              Bursu Gönder
            </button>
          </td>
        </tr>
      `;
      table.insertAdjacentHTML('afterbegin', newRow);
    } else {
      await addLog('<span class="text-red-500">HATA: Gelir eşiğin üzerinde. Kanıt oluşturulamadı (Constraint Failed).</span>', 800);
      
      const textFailedBtn = currentLang === 'tr' ? "Uygun Değilsiniz (Eşik Aşıldı)" : "Not Eligible (Threshold Exceeded)";
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> ${textFailedBtn}`;
      btn.classList.add('bg-red-600', 'hover:bg-red-700');
      btn.classList.remove('bg-brand-brown', 'hover-bg-brand-brown');
    }

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.className = "w-full bg-brand-brown hover-bg-brand-brown text-white font-medium py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all mt-2";
      document.getElementById('zk-code-block')!.classList.remove('hidden');
      terminal.classList.add('hidden');
    }, 5000);
  })();
};

(window as any).simulateDeploy = function() {
  const btn = document.getElementById('btn-deploy')!;
  const originalHTML = btn.innerHTML;
  
  const textDeploying = currentLang === 'tr' ? "Sözleşme Midnight ağına yükleniyor..." : "Deploying contract to Midnight network...";
  btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${textDeploying}`;
  
  setTimeout(() => {
    const textDeployed = currentLang === 'tr' ? "Dağıtım Başarılı! (Contract Deployed)" : "Deployment Successful! (Contract Deployed)";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${textDeployed}`;
    btn.classList.add('bg-green-600', 'hover:bg-green-700');
    btn.classList.remove('bg-brand-brown', 'hover-bg-brand-brown');
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.className = "w-full bg-brand-brown hover-bg-brand-brown text-white font-medium py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all mt-2";
    }, 3000);
  }, 2000);
};

// ==========================================
// CHATBOT LOGIC
// ==========================================
const chatData: Record<string, {tr: string, en: string}> = {
  "zk": {
    tr: "ZK (Zero-Knowledge) proof, bir bilginin kendisini açıklamadan doğruluğunu matematiksel olarak kanıtlama yöntemidir. Ağa sadece kanıt gider, veriniz cihazınızda kalır.",
    en: "A ZK (Zero-Knowledge) proof is a method of mathematically proving the validity of a statement without revealing the underlying data. Only the proof goes to the network, your data stays on your device."
  },
  "privacy": {
    tr: "Evet, kesinlikle! Midnight'ın ZK altyapısı sayesinde gelir veriniz tarayıcınızdan asla çıkmaz. Sadece uygun olduğunuzu ispatlayan bir 'kanıt' üretilir.",
    en: "Yes, absolutely! Thanks to Midnight's ZK infrastructure, your income data never leaves your browser. Only a 'proof' showing your eligibility is generated."
  },
  "contract": {
    tr: "Vakıf bir eşik belirleyip akıllı sözleşmeyi ağa dağıtır. Öğrenci başvurduğunda cüzdanı, sözleşmenin kurallarıyla eşleştirip lokal bir ZK kanıtı oluşturur.",
    en: "The foundation sets a threshold and deploys the smart contract. When a student applies, their wallet matches the rules and generates a local ZK proof."
  },
  "default": {
    tr: "Midnight ve ZK teknolojisi ile burs başvuru süreçlerini tamamen güvenilir ve anonim hale getiriyoruz! Başka ne öğrenmek istersiniz?",
    en: "We make scholarship applications completely trustless and anonymous with Midnight and ZK technology! What else would you like to know?"
  }
};

function getChatResponse(inputText: string): string {
  const t = inputText.toLowerCase();
  let key = "default";
  if (t.includes("zk")) key = "zk";
  else if (t.includes("gizli") || t.includes("private")) key = "privacy";
  else if (t.includes("sözleşme") || t.includes("contract") || t.includes("work")) key = "contract";
  
  return chatData[key][currentLang === 'tr' ? 'tr' : 'en'];
}

function appendMessage(text: string, isUser: boolean = false) {
  const chatMessages = document.getElementById('chat-messages')!;
  const msgDiv = document.createElement('div');
  
  if (isUser) {
    msgDiv.className = "text-sm text-white bg-brand-brown p-3 rounded-tl-xl rounded-tr-xl rounded-bl-xl ml-auto max-w-[90%]";
  } else {
    msgDiv.className = "text-sm text-gray-700 bg-gray-50 p-3 rounded-tr-xl rounded-br-xl rounded-bl-xl border border-dim max-w-[90%]";
  }
  msgDiv.innerText = text;
  
  const presets = document.getElementById('chat-presets');
  if (presets) {
    chatMessages.insertBefore(msgDiv, presets);
  } else {
    chatMessages.appendChild(msgDiv);
  }
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

(window as any).sendUserChat = function() {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  
  appendMessage(text, true);
  input.value = "";
  
  setTimeout(() => {
    appendMessage(getChatResponse(text));
  }, 1000);
};

(window as any).handleChatEnter = function(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    (window as any).sendUserChat();
  }
};

(window as any).sendPresetChat = function(presetText: string) {
  appendMessage(presetText, true);
  
  setTimeout(() => {
    appendMessage(getChatResponse(presetText));
  }, 600);
};

// ==========================================
// I18N LOGIC
// ==========================================
const trDict: Record<string, string> = {
  "Select Your Role": "Rolünüzü Seçin",
  "Are you applying for a scholarship or managing a foundation?": "Burs başvurusu mu yapacaksınız, yoksa bir vakfı mı yöneteceksiniz?",
  "I'm a Student": "Öğrenciyim",
  "Apply for a scholarship privately.": "Gizlilikle burs başvurusu yapın.",
  "I'm a Foundation": "Vakıf Yöneticisiyim",
  "Deploy contracts & verify students.": "Sözleşme yükleyin ve öğrencileri doğrulayın.",
  "Midnight Scholarship": "Midnight Burs",
  "ZK Privacy Scholarship Platform": "ZK Gizlilik Burs Platformu",
  "Win scholarships without revealing your income.": "Gelirini söylemeden burs kazan.",
  "Prove your scholarship eligibility with zero-knowledge proofs. Your income data never leaks from your browser, not even the foundation sees your actual salary.": "Sıfır bilgi kanıtıyla burs uygunluğunu ispatla. Gelir verisi tarayıcından dışarı sızmaz, vakıf bile gerçek maaşını göremez.",
  "Connect Lace Wallet": "Lace Cüzdanını Bağla",
  "Your income stays private": "Gelirin gizli kalır",
  "Your family income is kept as a <span class=\"font-mono text-xs bg-gray-100 px-1 py-0.5 rounded\">private witness</span> only in your browser's memory — it is never sent to the server, foundation, or blockchain.": "Aile gelirin <span class=\"font-mono text-xs bg-gray-100 px-1 py-0.5 rounded\">private witness</span> olarak yalnızca tarayıcının belleğinde tutulur — sunucuya, vakfa veya blokzincire asla gönderilmez.",
  "Proof is generated locally": "Kanıt lokalde üretilir",
  "The <span class=\"font-mono text-xs bg-gray-100 px-1 py-0.5 rounded\">check_eligibility(income)</span> circuit runs on your device; your eligibility turns into a mathematical ZK-SNARK proof.": "<span class=\"font-mono text-xs bg-gray-100 px-1 py-0.5 rounded\">check_eligibility(income)</span> devresi cihazında çalışır; uygunluğun matematiksel bir ZK-SNARK kanıtına dönüşür.",
  "Only the proof goes to the network": "Ağa sadece kanıt gider",
  "The foundation verifies the fact 'this student is below the threshold' without knowing your income. Nobody sees anything.": "Vakıf, gelirini bilmeden 'bu öğrenci eşiğin altında' gerçeğini doğrular. Ne gördüğü olur, ne kimse.",
  "Student Application": "Öğrenci Başvurusu",
  "Foundation Management": "Vakıf Yönetimi",
  "Application List": "Başvuru Listesi",
  "Prove your eligibility without telling anyone your income.": "Gelirini kimseye söylemeden uygunluğunu kanıtla.",
  "Income is a <span class=\"font-bold\">private witness</span>: kept only in this browser, never sent to the network even when generating a proof. Only the mathematical proof and an anonymous nullifier are transmitted.": "Gelir <span class=\"font-bold\">private witness</span> 'tır: yalnızca bu tarayıcıda tutulur, kanıt üretilirken bile ağa gönderilmez. Ağa yalnızca matematiksel kanıt (proof) ve anonim nullifier iletilir.",
  "Family Income ($)": "Aile Geliri (TL)",
  "Fetch Verified Data": "e-Devlet'ten Çek",
  "e.g. 8000": "Örn: 8000",
  "This value never leaves your browser. It is not sent to the server, foundation, or blockchain.": "Bu değer tarayıcınızdan asla çıkmaz. Sunucuya, vakfa veya blokzincire gönderilmez.",
  "Foundation Contract": "Vakıf Sözleşmesi",
  "Select a foundation contract": "Vakıf sözleşmesi seçin",
  "Education Foundation 2024 (Threshold: $10,000)": "Eğitim Vakfı 2024 (Eşik: 10.000 TL)",
  "(Optional) Enter contract address manually — 0x...": "(Opsiyonel) Sözleşme adresini elle girin — 0x...",
  "Apply for Scholarship / Prove Eligibility": "Bursa Başvur / Uygunluğumu Kanıtla",
  "Foundation Management — Contract Deployment": "Vakıf Yönetimi — Sözleşme Dağıtımı",
  "Set the scholarship threshold and deploy the contract to the Midnight network.": "Burs eşiğini belirle ve sözleşmeyi Midnight ağına yükle.",
  "Scholarship Threshold ($) — Maximum Income Limit": "Burs Eşiği (TL) — Maksimum Gelir Sınırı",
  "This value is the constructor argument of the contract and is written to the blockchain as <span class=\"font-bold\">Public State</span> — it is not secret, students prove they are below this.": "Bu değer sözleşmenin constructor argümanıdır ve <span class=\"font-bold\">Public State</span> olarak blokzincire yazılır — gizli değildir, öğrenciler bunun altında olduklarını kanıtlar.",
  "Deploy Contract": "Sözleşmeyi Başlat (Deploy)",
  "RECENT DEPLOYMENTS": "SON DAĞITIMLAR",
  "threshold $15,000": "eşik 15.000 ₺",
  "threshold $10,000": "eşik 10.000 ₺",
  "Proofs sent to the network — verified on Midnight.": "Ağa gönderilen kanıtlar — Midnight üzerinde doğrulanır.",
  "Since income data never enters the system, this list does <span class=\"font-bold\">NOT</span> contain income information — only the anonymous nullifier, ZK proof status, and application time are visible.": "Gelir verisi sisteme hiç girmediği için bu listede gelir bilgisi yer <span class=\"font-bold\">almaz</span> — yalnızca anonim nullifier, ZK kanıt durumu ve başvuru zamanı görünür.",
  "Time": "Zaman",
  "Student (Nullifier)": "Öğrenci (Nullifier)",
  "Proof Status": "Kanıt Durumu",
  "Action": "İşlem",
  "Send Scholarship": "Bursu Gönder",
  "Developer (Dev) Mode": "Geliştirici (Dev) Modu",
  "Hide/show background ZK-SNARK codes.": "Arka plandaki ZK-SNARK kodlarını gizle/göster.",
  "ZK Circuit Auditor": "ZK Devre Denetçisi",
  "Running Locally": "Lokal Çalışıyor",
  "Secret": "Gizli",
  "Public": "Açık",
  "To Network": "Ağa gider",
  "only on device": "sadece cihazda",
  "ZK Guide": "ZK Rehberi",
  "AI Assistant": "Claude destekli asistan",
  "Ask a question... (your income is never requested)": "Soru sor... (geliriniz asla istenmez)",
  "Hello! You can ask questions about ZK proofs, Midnight Network, and privacy.": "Merhaba! ZK kanıtları, Midnight Network ve gizlilik hakkında soru sorabilirsin.",
  "What is a ZK proof?": "ZK proof nedir?",
  "Will my income stay private?": "Gelirim gizli mi kalacak?",
  "How does the contract work?": "Burs sözleşmesi nasıl çalışır?"
};

let currentLang = 'en';

(window as any).setLang = function(lang: string) {
  if (currentLang === lang) return;
  currentLang = lang;

  document.getElementById('lang-en')!.className = lang === 'en' ? 'px-3 py-1.5 rounded-md bg-white text-brand-brown shadow-sm transition-all' : 'px-3 py-1.5 rounded-md text-dim hover:text-brand-brown transition-all';
  document.getElementById('lang-tr')!.className = lang === 'tr' ? 'px-3 py-1.5 rounded-md bg-white text-brand-brown shadow-sm transition-all' : 'px-3 py-1.5 rounded-md text-dim hover:text-brand-brown transition-all';

  const walkDOM = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) {
      const parent = node.parentNode as Element;
      // Skip script/style and already translated
      if (parent && !['SCRIPT', 'STYLE'].includes(parent.nodeName)) {
        let text = node.nodeValue.trim();
        if (lang === 'tr') {
          // Translate to TR if exists
          const trText = Object.keys(trDict).find(k => k === text) ? trDict[text] : null;
          if (trText) node.nodeValue = node.nodeValue.replace(text, trText);
        } else {
          // Translate to EN if exists
          const enText = Object.keys(trDict).find(k => trDict[k] === text);
          if (enText) node.nodeValue = node.nodeValue.replace(text, enText);
        }
      }
    } else {
      // Also check innerHTML for spans with classes inside them
      if (node.nodeType === Node.ELEMENT_NODE) {
         const el = node as Element;
         // Special case for buttons and p tags that have HTML inside
         if (el.innerHTML) {
            let html = el.innerHTML;
            if (lang === 'tr') {
                for (const [en, tr] of Object.entries(trDict)) {
                    if (html.includes(en)) el.innerHTML = html.replace(en, tr);
                }
            } else {
                for (const [en, tr] of Object.entries(trDict)) {
                    if (html.includes(tr)) el.innerHTML = html.replace(tr, en);
                }
            }
         }
      }
    }
  };

  // Safe innerHTML replacement for the whole body
  let bodyHtml = document.body.innerHTML;
  if (lang === 'tr') {
      for (const [en, tr] of Object.entries(trDict)) {
          bodyHtml = bodyHtml.split(en).join(tr);
      }
  } else {
      for (const [en, tr] of Object.entries(trDict)) {
          bodyHtml = bodyHtml.split(tr).join(en);
      }
  }
  
  // Actually we shouldn't replace body.innerHTML since it destroys event listeners.
  // Instead we'll reload the page with a query parameter in a real app, 
  // but for hackathon, replacing text nodes is safer. Let's do a simple recursive text node replacement.
};

(window as any).setLangSafe = function(lang: string) {
    if (currentLang === lang) return;
    currentLang = lang;

    document.getElementById('lang-en')!.className = lang === 'en' ? 'px-3 py-1.5 rounded-md bg-white text-brand-brown shadow-sm transition-all' : 'px-3 py-1.5 rounded-md text-dim hover:text-brand-brown transition-all';
    document.getElementById('lang-tr')!.className = lang === 'tr' ? 'px-3 py-1.5 rounded-md bg-white text-brand-brown shadow-sm transition-all' : 'px-3 py-1.5 rounded-md text-dim hover:text-brand-brown transition-all';

    const root = document.getElementById('view-landing')!.parentElement!;
    
    // Quick and dirty replacement for hackathon demo
    let html = root.innerHTML;
    if (lang === 'tr') {
        for (const [en, tr] of Object.entries(trDict)) {
            html = html.split(en).join(tr);
        }
    } else {
        for (const [en, tr] of Object.entries(trDict)) {
            html = html.split(tr).join(en);
        }
    }
    root.innerHTML = html;
};

// Override setLang to use safe replacement
(window as any).setLang = (window as any).setLangSafe;

function enableDemoMode() {
  // Switch from Landing to Dashboard
  const viewLanding = document.getElementById('view-landing');
  const viewDashboard = document.getElementById('view-dashboard');
  
  if (viewLanding) viewLanding.classList.add('hidden');
  if (viewDashboard) {
    viewDashboard.classList.remove('hidden');
    viewDashboard.classList.add('grid');
    
    // Hide tabs based on role
    const tabStudent = document.getElementById('tab-student');
    const tabFoundation = document.getElementById('tab-foundation');
    const tabList = document.getElementById('tab-list');
    
    if (userRole === 'student') {
      if (tabFoundation) tabFoundation.classList.add('hidden');
      if (tabList) tabList.classList.add('hidden');
      (window as any).switchTab('student');
    } else {
      if (tabStudent) tabStudent.classList.add('hidden');
      if (tabFoundation) tabFoundation.classList.remove('hidden');
      if (tabList) tabList.classList.remove('hidden');
      (window as any).switchTab('foundation');
    }
  }
  
  // Update Navbar
  const btnConnect = document.getElementById('btn-nav-connect');
  const walletConnected = document.getElementById('wallet-connected');
  if (btnConnect) btnConnect.classList.add('hidden');
  if (walletConnected) {
    walletConnected.classList.remove('hidden');
    walletConnected.classList.add('flex');
  }
}
