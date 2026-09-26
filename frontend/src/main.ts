import './polyfills';
import {
  AlreadyAppliedError,
  CONTRACT_ADDRESS,
  describeError,
  findIncomeInTx,
  findWallet,
  loadStudentSecret,
  nullifierHex,
  preprodPublicData,
  ProofOfNeedSession,
  readPublicLedger,
} from './midnight';
import type { Ledger } from '../../managed/burs_eligibility/contract/index.js';

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

// ==========================================
// MIDNIGHT: LACE CONNECTION, ELIGIBILITY PROOF, PUBLIC LEDGER
// ==========================================
let session: ProofOfNeedSession | undefined;

const el = (id: string) => document.getElementById(id)!;
const shorten = (s: string, head = 10, tail = 6) => (s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);
const formatDust = (specks: bigint) => `${(Number(specks) / 1e15).toLocaleString(undefined, { maximumFractionDigits: 2 })} DUST`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const t = (en: string, tr: string) => (currentLang === 'tr' ? tr : en);

const SPINNER = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

const renderContractAddress = () => {
  for (const id of ['student-contract-address', 'foundation-contract-address']) {
    const node = document.getElementById(id);
    if (node) node.textContent = CONTRACT_ADDRESS;
  }
};

/** Shows this browser's anonymous application ID and whether it was used. */
const renderStudentStatus = (state: Ledger) => {
  const node = document.getElementById('student-nullifier');
  if (!node) return;
  const secret = loadStudentSecret();
  const nullifier = nullifierHex(secret);
  const used = state.applications.member(Uint8Array.from(nullifier.match(/../g)!, (h) => parseInt(h, 16)));
  node.innerHTML = `<span class="font-mono" title="${nullifier}">${shorten(nullifier, 12, 8)}</span> · ${
    used
      ? `<span class="text-[#C62828] font-medium">${t('already used on-chain', 'zincirde kullanılmış')}</span>`
      : `<span class="text-[#2E7D32] font-medium">${t('not used yet', 'henüz kullanılmadı')}</span>`
  }`;
};

/** Reads threshold / counters / applications from the Preprod indexer. */
const refreshLedger = async (): Promise<Ledger | null> => {
  renderContractAddress();
  try {
    const state = await readPublicLedger(session?.publicData ?? preprodPublicData());
    if (!state) return null;
    const set = (id: string, v: bigint) => {
      const node = document.getElementById(id);
      if (node) node.textContent = v.toString();
    };
    set('ledger-threshold', state.threshold);
    set('ledger-total', state.totalChecks);
    set('ledger-eligible', state.eligibleCount);
    set('student-threshold', state.threshold);
    set('ledger-applications', state.applications.size());
    renderStudentStatus(state);
    return state;
  } catch (err) {
    console.error('Could not read the public ledger', err);
    return null;
  }
};
(window as any).refreshLedger = refreshLedger;

(window as any).connectWallet = async function () {
  const btn = el('btn-nav-connect');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `${SPINNER} ${t('Connecting...', 'Bağlanıyor...')}`;
  btn.classList.add('opacity-80', 'cursor-not-allowed');

  try {
    const wallet = findWallet();
    if (!wallet) {
      alert(
        t(
          'No Midnight wallet found. Install the Lace wallet extension, switch it to Preprod and reload this page.',
          'Midnight cüzdanı bulunamadı. Lace eklentisini kurun, Preprod ağına alın ve sayfayı yenileyin.',
        ),
      );
      return;
    }

    session = await ProofOfNeedSession.connect(wallet);
    el('wallet-address-display').textContent = shorten(session.info.unshieldedAddress, 12, 6);
    el('wallet-address-display').title = session.info.unshieldedAddress;
    el('wallet-dust-display').textContent = formatDust(session.info.dustBalance);
    el('wallet-dust-display').title = `${t('Prover used by Lace', "Lace'in kullandığı prover")}: ${session.info.proverServerUri ?? t('not reported', 'bildirilmedi')}`;
    renderDustWarning();
    console.info('[ProofOfNeed] Lace configuration', {
      wallet: `${session.info.name} (DApp connector ${session.info.apiVersion})`,
      proverServerUri: session.info.proverServerUri,
      dust: session.info.dustBalance.toString(),
      dustAddress: session.info.dustAddress,
    });

    enableDemoMode();
    await refreshLedger();
  } catch (error) {
    console.error('Wallet connection failed', error);
    session = undefined;
    alert(`${t('Wallet connection failed: ', 'Cüzdan bağlantısı başarısız oldu: ')}${(error as Error).message}`);
  } finally {
    btn.innerHTML = originalHTML;
    btn.classList.remove('opacity-80', 'cursor-not-allowed');
  }
};

/** Explains how to get DUST when the connected wallet cannot pay fees yet. */
const renderDustWarning = () => {
  const box = el('dust-warning');
  if (!session || session.info.dustBalance > 0n) {
    box.classList.add('hidden');
    box.classList.remove('flex');
    return;
  }
  box.innerHTML = `
    <p class="font-semibold text-sm text-[#8A5A00]">${t('Your Lace wallet has no DUST yet', "Lace cüzdanınızda henüz DUST yok")}</p>
    <p class="text-xs text-[#8A5A00]">${t(
      'Transaction fees on Midnight are paid in DUST, which your tNIGHT generates once it is registered. In Lace, open the Midnight wallet, press "Generate tDUST" on the main screen, confirm, and try again after a few minutes.',
      `Midnight'ta işlem ücretleri, kayıtlı tNIGHT'ın ürettiği DUST ile ödenir. Lace'te Midnight cüzdanının ana ekranındaki "Generate tDUST" butonuna basıp onaylayın, birkaç dakika sonra tekrar deneyin.`,
    )}</p>
    <p class="text-[11px] text-[#8A5A00]">${t('DUST is generated to', 'DUST şu adrese üretilir')}: <span class="font-mono break-all">${escapeHtml(session.info.dustAddress)}</span></p>`;
  box.classList.remove('hidden');
  box.classList.add('flex');
};

(window as any).disconnectWallet = function () {
  // DApp connector v4 has no revoke call; dropping the session forgets the
  // connected API and every provider built on it (including in-memory private state).
  session = undefined;

  el('view-landing').classList.remove('hidden');
  el('view-dashboard').classList.add('hidden');
  el('view-dashboard').classList.remove('grid');
  el('btn-nav-connect').classList.remove('hidden');
  el('wallet-connected').classList.add('hidden');
  el('wallet-connected').classList.remove('flex');
  el('wallet-address-display').textContent = '';
  el('proof-result').classList.add('hidden');
  el('privacy-check').classList.add('hidden');
};

(window as any).switchTab = function (tabId: string) {
  for (const t of ['student', 'foundation', 'list']) {
    el('content-' + t).classList.add('hidden');
    el('content-' + t).classList.remove('flex');
    el('tab-' + t).classList.remove('border-brand-brown', 'text-[#1A1A1A]');
    el('tab-' + t).classList.add('border-transparent', 'text-dim');
  }
  el('content-' + tabId).classList.remove('hidden');
  el('content-' + tabId).classList.add('flex');
  el('tab-' + tabId).classList.add('border-brand-brown', 'text-[#1A1A1A]');
  el('tab-' + tabId).classList.remove('border-transparent', 'text-dim');
  if (tabId !== 'student') void refreshLedger();
};

const addLog = (msg: string) => {
  const logs = el('zk-logs');
  logs.insertAdjacentHTML('beforeend', `<div>&gt; ${msg}</div>`);
  el('zk-terminal-block').scrollTop = el('zk-terminal-block').scrollHeight;
};

const addApplicationRow = (nullifier: string, txId: string, eligible: boolean, blockHeight: number) => {
  document.getElementById('applications-empty')?.remove();
  const now = new Date();
  const badge = eligible
    ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E8F5E9] text-[#2E7D32]">eligible</span>'
    : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FDECEA] text-[#C62828]">not eligible</span>';
  el('applications-table').insertAdjacentHTML(
    'afterbegin',
    `<tr class="border-b border-dim hover:bg-gray-50">
      <td class="py-4 pl-2 text-sm text-dim">${now.toLocaleString()}</td>
      <td class="py-4 font-mono text-sm" title="nullifier ${nullifier}\ntransaction ${txId}">${shorten(nullifier, 10, 8)}</td>
      <td class="py-4">${badge}</td>
      <td class="py-4 text-right pr-2 font-mono text-sm">${blockHeight}</td>
    </tr>`,
  );
};

const containsBytes = (haystack: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

const renderPrivacyCheck = (
  income: bigint,
  secret: Uint8Array,
  nullifier: string,
  submittedTx: Uint8Array,
  before: Ledger | null,
  after: Ledger | null,
) => {
  const found = findIncomeInTx(submittedTx, income);
  const secretFound = containsBytes(submittedTx, secret);
  const prover = session?.info.proverServerUri ?? t('the prover configured in Lace', "Lace'te ayarlı prover");
  const counters = (l: Ledger | null) =>
    l ? `totalChecks=${l.totalChecks}, eligibleCount=${l.eligibleCount}, applications=${l.applications.size()}` : '?';
  const box = el('privacy-check');
  box.innerHTML = `
    <p class="font-semibold text-sm">${t('Privacy check for this proof', 'Bu kanıt için gizlilik kontrolü')}</p>
    <ul class="text-xs flex flex-col gap-1.5">
      <li>🔒 ${t('Income you typed', 'Girdiğiniz gelir')}: <span class="font-mono">${income}</span> ${t('(kept in this tab\'s memory, wiped after proving)', '(sekmenin belleğinde tutuldu, kanıttan sonra silindi)')}</li>
      <li>🧮 ${t('Proof generated by', 'Kanıtı üreten')}: <span class="font-mono">${escapeHtml(prover)}</span> ${t('(runs on your machine)', '(sizin makinenizde çalışır)')}</li>
      <li>📦 ${t('Transaction sent to Midnight', "Midnight'a gönderilen işlem")}: <span class="font-mono">${submittedTx.length}</span> bytes</li>
      <li>${found ? '⚠️' : '✅'} ${t('Income bytes inside that transaction', 'Bu işlemin içinde gelirin byte karşılığı')}: <span class="font-semibold">${found ? t('found', 'bulundu') : t('not found', 'bulunamadı')}</span> <span class="text-dim">(${t('searched for the 64-bit value in both byte orders', '64-bit değer iki byte sırasıyla arandı')})</span></li>
      <li>${secretFound ? '⚠️' : '✅'} ${t('Student secret inside that transaction', 'Bu işlemin içinde öğrenci gizli anahtarı')}: <span class="font-semibold">${secretFound ? t('found', 'bulundu') : t('not found', 'bulunamadı')}</span></li>
      <li>🏷️ ${t('Published instead: anonymous nullifier', 'Onun yerine yayınlanan: anonim nullifier')} <span class="font-mono" title="${nullifier}">${shorten(nullifier, 12, 8)}</span> <span class="text-dim">(${t('a hash of the secret; blocks a second application, reveals nobody', 'gizli anahtarın hash\'i; ikinci başvuruyu engeller, kimseyi ifşa etmez')})</span></li>
      <li>🌐 ${t('Public ledger before', 'Önceki public ledger')}: <span class="font-mono">${counters(before)}</span></li>
      <li>🌐 ${t('Public ledger after', 'Sonraki public ledger')}: <span class="font-mono">${counters(after)}</span></li>
    </ul>
    <p class="text-xs text-dim">${t(
      'The chain learned one bit (eligible or not) and one anonymous nullifier. The number that produced the result was proven, never shown.',
      'Zincir yalnızca tek bir bit (uygun ya da değil) ve bir anonim nullifier öğrendi. Bu sonucu üreten sayı kanıtlandı ama hiç gösterilmedi.',
    )}</p>`;
  box.classList.remove('hidden');
  box.classList.add('flex');
};

(window as any).generateProof = async function () {
  const btn = el('btn-proof');
  const input = el('income-input') as HTMLInputElement;
  const raw = input.value.trim();

  if (!session) {
    alert(t('Connect your Lace wallet first.', 'Önce Lace cüzdanınızı bağlayın.'));
    return;
  }
  if (!/^\d+$/.test(raw)) {
    alert(t('Enter your monthly family income as a whole number.', 'Aylık aile gelirinizi tam sayı olarak girin.'));
    return;
  }
  const income = BigInt(raw);
  if (income >= 2n ** 64n) {
    alert(t('That number is too large.', 'Bu sayı çok büyük.'));
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = `${SPINNER} ${t('Proving and submitting...', 'Kanıtlanıyor ve gönderiliyor...')}`;
  btn.setAttribute('disabled', 'true');
  el('proof-result').classList.add('hidden');
  el('privacy-check').classList.add('hidden');

  el('zk-auditor-container').classList.remove('hidden');
  el('zk-code-block').classList.add('hidden');
  el('zk-terminal-block').classList.remove('hidden');
  el('zk-logs').innerHTML = '';

  try {
    addLog(t('Reading public ledger from the Preprod indexer...', 'Public ledger Preprod indexer\'ından okunuyor...'));
    const before = await refreshLedger();
    const secret = loadStudentSecret();
    addLog(t('Income and student secret stored as private state in memory (not sent anywhere).', 'Gelir ve öğrenci gizli anahtarı bellekte private state olarak tutuluyor (hiçbir yere gönderilmiyor).'));
    addLog(t('Running check_eligibility locally and asking Lace\'s prover for a ZK proof...', "check_eligibility yerelde çalıştırılıyor, Lace'in prover'ından ZK kanıtı isteniyor..."));
    addLog(t('Lace will ask you to approve the transaction.', 'Lace işlemi onaylamanızı isteyecek.'));

    const result = await session.checkEligibility(income, secret);
    input.value = '';

    addLog(t(`Transaction confirmed in block ${result.blockHeight}.`, `İşlem ${result.blockHeight} numaralı blokta onaylandı.`));
    const after = await refreshLedger();
    addLog(t('Public ledger re-read. Done.', 'Public ledger yeniden okundu. Tamamlandı.'));

    const box = el('proof-result');
    box.className = `border rounded-xl p-4 flex flex-col gap-2 ${result.eligible ? 'border-[#2E7D32]/30 bg-[#F5FBF5]' : 'border-[#C62828]/30 bg-[#FDF5F5]'}`;
    box.innerHTML = `
      <p class="font-semibold ${result.eligible ? 'text-[#2E7D32]' : 'text-[#C62828]'}">${
        result.eligible
          ? t('Eligible: the network verified your income is below the threshold.', 'Uygun: ağ, gelirinizin eşiğin altında olduğunu doğruladı.')
          : t('Not eligible: your income is not below the threshold.', 'Uygun değil: geliriniz eşiğin altında değil.')
      }</p>
      <p class="text-xs text-dim">Transaction <span class="font-mono break-all">${result.txId}</span> · block ${result.blockHeight}</p>
      <p class="text-xs text-dim">${t('Anonymous application ID (nullifier)', 'Anonim başvuru kimliği (nullifier)')}: <span class="font-mono break-all">${result.nullifier}</span></p>`;

    renderPrivacyCheck(income, secret, result.nullifier, result.submittedTx, before, after);
    addApplicationRow(result.nullifier, result.txId, result.eligible, result.blockHeight);
    el('wallet-dust-display').textContent = formatDust(await session.refreshDustBalance());
    renderDustWarning();
  } catch (error) {
    if (error instanceof AlreadyAppliedError) {
      addLog(t('This browser\'s nullifier is already on-chain. No transaction was sent.', 'Bu tarayıcının nullifier\'ı zaten zincirde. İşlem gönderilmedi.'));
      alert(
        t(
          'You have already applied to this foundation. Each student can apply once; no fee was charged.',
          'Bu vakfa zaten başvurdunuz. Her öğrenci bir kez başvurabilir; ücret alınmadı.',
        ),
      );
      return;
    }
    console.error('Eligibility check failed', error);
    const detail = describeError(error);
    addLog(`<span class="text-red-500">${escapeHtml(detail)}</span>`);
    const noDust = /InsufficientFunds/.test(detail) && /dust/i.test(detail);
    alert(
      noDust
        ? t(
            'Your Lace wallet has no DUST to pay the transaction fee. In Lace, press "Generate tDUST" on the Midnight wallet screen, wait a few minutes and try again.',
            `Lace cüzdanınızda işlem ücreti için DUST yok. Lace'te Midnight cüzdan ekranındaki "Generate tDUST" butonuna basın, birkaç dakika bekleyip tekrar deneyin.`,
          )
        : `${t('Eligibility check failed: ', 'Uygunluk kontrolü başarısız oldu: ')}${detail}`,
    );
  } finally {
    btn.innerHTML = originalHTML;
    btn.removeAttribute('disabled');
  }
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
  "Income is a <span class=\"font-bold\">private witness</span>: kept only in this browser, never sent to the network even when generating a proof. Only the proof, the yes/no result and an anonymous application ID (nullifier) reach the network.": "Gelir bir <span class=\"font-bold\">private witness</span>: yalnızca bu tarayıcıda tutulur, kanıt üretilirken bile ağa gönderilmez. Ağa yalnızca kanıt, evet/hayır sonucu ve anonim bir başvuru kimliği (nullifier) ulaşır.",
  "Monthly family income (TL)": "Aylık aile geliri (TL)",
  "e.g. 8000": "Örn: 8000",
  "This value never leaves your browser. It is not sent to the server, foundation, or blockchain.": "Bu değer tarayıcınızdan asla çıkmaz. Sunucuya, vakfa veya blokzincire gönderilmez.",
  "Foundation Contract": "Vakıf Sözleşmesi",
  "Apply for Scholarship / Prove Eligibility": "Bursa Başvur / Uygunluğumu Kanıtla",
  "Live public state of the deployed eligibility contract.": "Deploy edilmiş uygunluk sözleşmesinin canlı public durumu.",
  "Contract address (Midnight Preprod)": "Sözleşme adresi (Midnight Preprod)",
  "Refresh public ledger": "Public ledger'ı yenile",
  "Eligibility checks submitted from this browser session.": "Bu tarayıcı oturumundan gönderilen uygunluk kontrolleri.",
  "No checks submitted yet.": "Henüz kontrol gönderilmedi.",
  "Time": "Zaman",
  "Nullifier": "Nullifier",
  "Result": "Sonuç",
  "Block": "Blok",
  "Developer (Dev) Mode": "Geliştirici (Dev) Modu",
  "Hide/show background ZK-SNARK codes.": "Arka plandaki ZK-SNARK kodlarını gizle/göster.",
  "ZK Circuit Auditor": "ZK Devre Denetçisi",
  "Running Locally": "Lokal Çalışıyor",
  "Secret": "Gizli",
  "Public": "Açık",
  "To Network": "Ağa gider",
  "only on device": "sadece cihazda",
  "ZK Guide": "ZK Rehberi",
  "Quick answers": "Hızlı cevaplar",
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

// Show the deployed contract and its live public ledger on load.
renderContractAddress();
void refreshLedger();
