# ProofOfNeed: İhtiyacını kanıtla, gelirini söyleme

ProofOfNeed, Midnight üzerinde çalışan bir burs uygunluk sözleşmesi. Öğrenci, ailesinin gelirinin vakfın belirlediği eşiğin altında olduğunu sıfır bilgi kanıtıyla ispatlıyor. Gelirin kendisi ne zincire yazılıyor ne de öğrencinin cihazından çıkıyor.

## Ürün fikri

Bugün burs başvurusu yapan bir öğrenci, ailesinin gelirini, mesleğini ve iş yerini bir memura ya da vakıf görevlisine açmak zorunda. Bu hem gereğinden fazla kişisel verinin toplanması demek hem de birçok aile için utanç verici bir süreç. Vakfın aslında bilmesi gereken tek şey "bu öğrenci eşiğin altında mı?" sorusunun cevabı. ProofOfNeed'de vakıf eşiği zincire yazıyor, öğrenci gelirini sadece kendi cihazında kullanarak bir kanıt üretiyor ve ağ bu kanıtı doğruluyor. Vakıf evet/hayır cevabını görüyor, rakamı hiçbir zaman görmüyor. İlerleyen aşamalarda uygun bulunan öğrencilere bağışçı fonlarından aylık ödeme yapılması planlanıyor.

## Public state ve private witness

Compact'ta circuit girdileri varsayılan olarak gizli. `disclose()` bir değeri kendi başına public yapmaz. Derleyiciye "bu değerin açığa çıkmasını bilerek kabul ediyorum" demenin yolu budur. Bir değer ancak public bir alana geçtiğinde görünür hale gelir: ledger'a yazıldığında, export edilmiş bir circuit'ten döndürüldüğünde ya da başka bir sözleşmeye gönderildiğinde.

Sözleşme ([burs_eligibility.compact](burs_eligibility.compact)) bu ayrımı şöyle kullanıyor:

| | Ne | Nerede | Kim görebilir |
|---|---|---|---|
| Public ledger | `threshold` | Zincir | Herkes. Vakfın kuralı zaten şeffaf olmalı. |
| Public ledger | `totalChecks`, `eligibleCount` | Zincir | Herkes. Kaç kontrol yapıldığı ve kaçının olumlu sonuçlandığı. |
| Circuit sonucu | `check_eligibility()` dönüşü (Boolean) | İşlem transcript'i | Herkes. Sadece uygun/uygun değil bilgisi. |
| Private witness | `familyIncome()` | Öğrencinin cihazı | Sadece öğrenci. |

`familyIncome()` bir `witness`. Değerini öğrencinin yerel DApp'i sağlıyor ([src/witnesses.ts](src/witnesses.ts)) ve bu değer ZK kanıtının içinde kullanılıyor. Circuit'te `disclose()` sadece karşılaştırmanın sonucuna uygulanıyor:

```compact
export circuit check_eligibility(): Boolean {
    const eligible = disclose(familyIncome() < threshold);
    ...
}
```

Gelirin kendisini ledger'a yazmaya ya da döndürmeye çalışırsanız derleyici `disclose()` olmadan buna izin vermez. Bu da gelirin kazara açığa çıkmasını derleme aşamasında engelliyor.

Zinciri izleyen biri eşiği, kaç kontrol yapıldığını ve her kontrolün sonucunu görebilir. Gelir rakamını, meslek ya da aile bilgilerini göremez.

## Proje yapısı

```
burs_eligibility.compact   Compact sözleşmesi
managed/burs_eligibility/  Derleme çıktısı (circuit, prover/verifier anahtarları, zkir, TS bağlamaları)
src/witnesses.ts           Private state tipi ve familyIncome witness'ının implementasyonu
tests/                     Sözleşmeyi yerelde çalıştıran simülatör ve testler
scripts/deploy.ts          Preprod'a deploy script'i
frontend/                  Web arayüzü (Level 2 kapsamında)
```

## Kurulum

Gerekenler:

- Node.js 22 veya üstü
- Compact araç zinciri ve compiler 0.31.1. Windows'ta WSL (Ubuntu) içinde kurulmalı.

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1
```

Compiler sürümü önemli. Stabil Midnight SDK'sı (midnight-js 4.x) compact-runtime 0.16 kullanıyor. Bu runtime'ı 0.31.1 üretiyor, daha yeni compiler'lar farklı bir runtime'a göre kod üretiyor.

Repoyu klonlayıp bağımlılıkları kurun:

```bash
git clone https://github.com/themlie/stellarMidnight-ProofOfNeed.git
cd stellarMidnight-ProofOfNeed
npm install
```

### Derleme

```bash
npm run compile
```

Bu komut `compact compile +0.31.1 burs_eligibility.compact managed/burs_eligibility` çalıştırıyor ve `managed/` dizinini yeniden oluşturuyor.

![Derleme çıktısı](docs/compile.png)

### Testler

```bash
npm test
```

Testler derlenmiş sözleşmeyi `compact-runtime` üzerinde gerçekten çalıştırıyor ve geliri private witness olarak veriyor. Kontrol edilen durumlar: eşiğin altında, üstünde ve eşitinde gelir, sıfır gelir, deploy sonrası ledger durumu ve ledger'da gelire dair hiçbir alanın bulunmaması.

### Preprod'a deploy

1. Deploy script'ini çalıştırın:

   ```bash
   npm run deploy
   ```

   İlk çalıştırmada script yeni bir cüzdan oluşturuyor ve seed'ini `.env` dosyasına yazıyor. `.env` git'e dahil değil. Seed'i ayrıca güvenli bir yerde saklayın.

   İlk senkronizasyon Preprod geçmişinin tamamını taradığı için uzun sürüyor. Script ilerlemeyi dakikada bir `.wallet-cache/` klasörüne kaydediyor, bir sonraki çalıştırma kaldığı yerden devam ediyor.

2. Script cüzdanın unshielded adresini yazdırıyor. Bu adrese [Preprod faucet](https://faucet.preprod.midnight.network) üzerinden tNIGHT gönderin.

3. Script tNIGHT'ı görünce onu DUST üretimine kaydediyor. İşlem ücretleri DUST ile ödeniyor ve DUST, tuttuğunuz NIGHT'tan zamanla üretiliyor. Bu yüzden DUST'ı başka bir yerden transfer etmeniz ya da takaslamanız gerekmiyor. Bakiye oluşunca sözleşme `threshold = 10000` ile deploy ediliyor ve adres `deployment-preprod.json` dosyasına yazılıyor.

ZK proof'lar Node içinde WASM ile üretiliyor, yani Docker gerekmiyor. Bu contract'ın anahtarları `managed/` klasöründen okunuyor, cüzdanın kendi zswap/dust anahtarları ise ilk kullanımda indiriliyor. Yerel bir proof server kullanmak isterseniz:

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v
PROOF_SERVER_URL=http://127.0.0.1:6300 npm run deploy
```

## Deploy bilgileri

- Ağ: Midnight Preprod
- Contract address: `<DEPLOY_SONRASI_EKLENECEK>`

![Deploy çıktısı](docs/deploy.png)
