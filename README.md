# İ2 BURS — "İhtiyacını kanıtla, gelirini söyleme"

**Proje Konsepti:** 
Günümüzde burs başvuruları, öğrencilerin ve ailelerinin tüm finansal verilerini (gelir, meslek, iş yeri vb.) merkezi kurumlara veya bir yetkiliye açmasını gerektiriyor. Bu durum hem gizlilik ihlali yaratıyor hem de sosyoekonomik bir "utanç" unsuru olabiliyor. **İ2 BURS** projesi, Midnight ağının Sıfır Bilgi (Zero-Knowledge) teknolojisini kullanarak bu problemi çözer. Öğrenci sadece gelirinin, bağışçı/vakıf tarafından belirlenen "Burs Eşiğinin" altında olduğunu kanıtlar. Ailenin gerçek geliri, iş yeri veya diğer hiçbir hassas verisi zincire yazılmaz ve kimseyle paylaşılmaz.

### Teknik Mimari: Public State vs Private Witness

Midnight ağının `private-by-default` (varsayılan olarak gizli) yapısı bu proje için kusursuzdur:

*   **Public State (Açık Durum):** Sözleşmedeki `threshold` (eşik) değeri public ledger'da tutulur. Bu, vakfın belirlediği şeffaf kuraldır (Örn: Geliri 10.000 TL'nin altında olanlar burs alabilir). Ayrıca sürecin sonunda çıkan `eligible: Boolean` (Bursa uygun mu?) sonucu da herkes tarafından doğrulanabilir.
*   **Private Witness (Gizli Kanıt):** Öğrencinin aile geliri (`income`), mesleği veya kişisel bilgileri **asla** public ağa yazılmaz. Bu veriler yalnızca öğrencinin kendi cihazında lokal olarak (private witness) devreden (circuit) geçer ve sıfır bilgi kanıtı (ZK-Proof) üretir. Ağ sadece kanıtı doğrular, verinin kendisini bilmez.

---

### Kurulum (Local Çalıştırma)

Bu projeyi bilgisayarınızda derlemek ve test etmek için WSL (Ubuntu) ortamında Midnight Compact Derleyicisi'nin kurulu olması gerekir.

1. Proje dizinine gidin.
2. Derlemek için şu komutu çalıştırın:
   ```bash
   compact compile burs_eligibility.compact .
   ```
3. Testleri çalıştırmak için paketleri yükleyip Jest testlerini başlatın:
   ```bash
   npm install
   npm test
   ```

### Dağıtım (Deploy) Bilgileri
* **Ağ:** Midnight Preprod
* **Contract Address:** `<DEPLOY_EDILINCE_BURAYA_YAZILACAK>`
