# Bark & Frame - kontext pro nove vlakno

## Projekt

- Projekt: Bark & Frame Shopify theme
- Workspace: `/Users/uzivatel/Desktop/Bark & Frame/barkandframe`
- Repo: `https://github.com/paparezzit/barkandframe.git`
- Branch: `main`
- Shopify store: `barkandframe.myshopify.com`
- Live theme: `Dwell - updated by SpoluDesign (#186143670618)`
- Casove pasmo: `Europe/Prague`

## Shopify CLI a deploy

Pouzivat pouze lokalni Shopify CLI:

```bash
portrait-pricing/node_modules/.bin/shopify
```

Deploy konkretniho souboru na live theme:

```bash
portrait-pricing/node_modules/.bin/shopify theme push --store barkandframe.myshopify.com --live --allow-live --path . --only CESTA_K_SOUBORU
```

Po kazde uprave theme souboru:

1. Upravit soubor.
2. Pushnout konkretni zmenene soubory na live Shopify theme pres `--only`.
3. Dat zmenu do gitu:

```bash
git add CESTA_K_SOUBORU
git commit -m "..."
git push
```

## Pracovni zasady

- Nedelat pouze lokalne, pokud jde o theme zmenu.
- Nepoustet lokalni dev server, pokud si ho uzivatel vyslovne nevyzada.
- Pri uploadu novych obrazku neprepisovat ani "nevylepsovat" nazvy souboru. Zachovat puvodni nazvy.
- Nesahat na `_order`, cart/order JSON, line item properties ani logiku vytvareni objednavkovych dat bez vyslovneho povoleni.
- Neprovadet plosne refaktory ani obecne "pojistky". Jen ciste, cilene upravy podle zadani.
- Pri nasazeni pouzivat idealne `--only` na konkretni zmenene soubory.
- Nezdrzovat zbytecnym overovanim. Kontrolovat jen nutne syntax/safety veci.
- Pred zmenou v citlive oblasti nejdriv najit existujici pattern a menit co nejmensi rozsah.

## Dulezite soubory

- `sections/portrait-styles.liquid`
  - Homepage sekce `Different styles. No wrong choice.`
  - Labely `BESTSELLER`, `SOON`, `STUDIO CHOICE`
  - Hover zvetsovani dlazdic a pozice labelu

- `sections/make-portrait-configurator.liquid`
  - Konfigurator portretu
  - Kroky 1-4, volby stylu, produktu, size/framing/border/frame color, add copies, donations
  - Pozor: nesahat na order/cart payload logiku bez povoleni

- `snippets/cart-drawer.liquid`
  - Cart drawer
  - Upsell panel `Add and save`
  - Variant/color dropdown logika a ceny po sleve

- `sections/header.liquid`
  - Shopify settings pro cart upsell
  - Produkty, sleva, default barvy

- `sections/header-group.json`
  - Aktualni Shopify konfigurace header/cart upsellu

- `templates/page.contact.json`
  - FAQ / Contact stranka

- `assets/base.css`
  - Hlavni CSS, vcetne FAQ/contact a casti globalnich uprav

## Aktualni stav homepage labelu

V `sections/portrait-styles.liquid`:

- `BESTSELLER` label je na stylech:
  - `La Parisienne`
  - `Pure Portrait`
  - `Studio Pencil`

- `Atelier Sketch`:
  - Ma label `SOON`.
  - Obrazek je zatmaveny/utazeny.
  - Label a text pod dlazdici maji zustat bez opacity.
  - Pod samotnou dlazdici je bezovy podklad, aby se pri hover/prekryvu nemichaly okolni obrazky.
  - Label nesmi menit velikost pri hoveru.

- `Studio Pop`:
  - Ma label `STUDIO CHOICE`.
  - Aktualni pozadavek po revertu: fialove pozadi labelu a hnede pismo.
  - Posledni commit k tomu: `f7a7af5 Restore studio choice purple label`.

- U `BESTSELLER` labelu na homepage:
  - Pri hover zvetseni dlazdice musi label zustat stejne velky.
  - Label se ma drzet u leveho horniho okraje zvetsene dlazdice.
  - Nesmí byt zarovnany stredem na horni hranu.
  - Leva hrana labelu = leva hrana dlazdice.
  - Horni hrana labelu = horni hrana dlazdice.
  - Hover efekt dlazdice se nesmi rozbit.

## Aktualni stav konfiguratoru

V `sections/make-portrait-configurator.liquid`:

- `BESTSELLER` label zustava na volbe size:
  - `33 x 43 cm`
  - `13.0 x 16.9 in`

- `BESTSELLER` label byl zrusen:
  - Canvas -> `Frame Color - Black`
  - Fine Art Paper -> `Frame Color - Black`
  - Fine Art Paper -> `Framing - Framed`
  - Fine Art Paper -> `Border - No Border`

- Zelene aktivni outline maji byt inside / nesmi rozbijet layout.
- Podkladove cream bordery u voleb byly drive ruseny, ale aktivni zeleny outline musi zustat.
- U slozenych voleb typu `Add copies` a `Koninklijke Hondenbescherming` musi byt zeleny outline na cely blok, ne na jednotlive vnitrni volby, pokud to uzivatel tak specifikuje.
- Klik na cely blok ma aktivovat/deaktivovat danou volbu podle aktualni logiky.
- U `Dog's name`:
  - Limit text field je 8 znaku.
  - Info bublina ma radius `10px`.
  - Info bublina ma stin ze vsech stran, posledni cilena opacity hodnota byla `0.054`.

## Aktualni stav cart upsellu

V cart drawer upsell panelu:

- Nadpis: `Add and save`
- Typografie nadpisu: `Display Extra Small`
- Nadpis je vlevo nad dlazdicemi a nema se horizontálně scrollovat s produkty.
- Mezera nad nadpisem ma byt stejna jako pod nim.

Upsell je nastavitelny pres Shopify:

- Settings jsou v `sections/header.liquid`.
- Aktualni hodnoty jsou v `sections/header-group.json`.
- Pokud neni vybran zadny produkt, upsell se nema zobrazit.
- Produkty maji byt 1 az libovolny pocet podle vyberu v Shopify.
- Procentualni sleva je nastavitelna hromadne.
- Aktualni sleva: `15%`.
- Ceny se zaokrouhluji na cela cisla, bez desetin a setin.
- Hlavni cena = cena po sleve.
- Puvodni cena je pod ni, mensim pismem, preskrtnuta.
- Barva puvodni ceny ma odpovidat barve zatazene ceny v detailu produktu.

Aktualni produkty/defaulty:

- `Chill Vibes | T-Shirt`
  - handle: `chill-vibes-t-shirt`
  - default color: `Black`

- `Doggery Squad | Crewneck`
  - handle: `doggery-squad-crewneck`
  - default color: `Heather Grey`

- `More Dog is More Dog | Cap`
  - handle: `more-dog-is-more-dog-cap`
  - default color: `Black`

Upsell obrazek:

- Nema se nastavovat indexem galerie.
- Ma se menit podle zvolene barvy z dropdownu.
- Shopify setting urcuje defaultni barvu.
- Velikost muze menit variantu/add-to-cart, ale nema menit preview image.

## Shopify discount info

Kod `DA11-MT06-YR26_B&F_Test01`:

- Typ: `Amount off order`
- Hodnota: `100%`
- Plati na celou objednavku, ne jen na produkt.
- Nezahrnuje automaticky shipping.
- Pro 100% shipping je potreba samostatny shipping discount kod, pokud se nepouzije jiny checkout/cart URL mechanismus.
- Na screenshotu byl kod aktivni, pro Online Store, all customers, 100% off entire order, limit 1000 uses, active from June 11.

## FAQ / Contact oblast

Relevantni soubory:

- `templates/page.contact.json`
- `assets/base.css`

Pozadavky, ktere uz v historii padly:

- Desktop FAQ/Contact layout: 50% harmonika/text a 50% prostor pro obrazek.
- Na breakpointech se nema drzet 50/50, ale skladat pod sebe.
- Na landscape tabletu obrazky vedle harmoniky jako desktop; portrait tablet/mobile stacked.
- Pri preskladani musi byt obrazek vzdy nad nadpisem/harmonikou sve sekce.
- Obrazky zustavaji i na mobilu.
- Na mobilu byly obrazky zmensovane.
- Intro text pod H1 nesmi nikdy prekryvat nadpis.
- Contact form na breakpointech mimo desktop ma byt na sirku obsahu se zachovanymi okraji webu, ne nalepeny na kraje viewportu.

## Posledni zname gity

Worktree byl po posledni kontrole cisty.

Posledni commity:

```text
f7a7af5 Restore studio choice purple label
ccd6ae1 Update studio choice label colors
662dda5 Add studio choice portrait label
821859d Anchor portrait bestseller badges to media edge
9759576 Restore portrait hover scale CSS
4497c57 Align portrait bestseller labels to scaled edge
5ba7bac Inset portrait bestseller hover labels
881cb87 Move bestseller labels on portrait hover
15c6829 Remove bestseller labels from frame options
55fa0c1 Keep soon label stable on portrait hover
9c6ee8c Match Atelier Sketch soon badge style
149f7d7 Fix Atelier Sketch soon label hover
```

## Poznamky pro dalsi vlakno

- Pokud se resi vizualni bug na live theme, nejdriv najit presny selector/soubor, upravit minimalne, deploynout `--only`, commit, push.
- U citlivych veci v konfiguratoru nemenit datove payloady objednavky.
- U Shopify nastaveni preferovat Shopify settings/JSON konfiguraci pred hardcodem, pokud uzivatel rekne "pres Shopify".
- Pokud jde o soubor mimo theme, napr. tento kontextovy markdown, Shopify deploy neni potreba.
