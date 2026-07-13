# ScanGo - SWOT Analysis

**Document Version:** 1.0  
**Last Updated:** 2026-07-12  
**Status:** Active

---

## Executive Summary

**Key Insights:**
- ✅ Strengths cluster around "low barrier + high ROI" = perfect for risk-averse first-time owners
- ⚠️ Weaknesses are mostly perception issues (no offline, no brand), not fundamental flaws
- 🚀 Multiple tailwinds: QR normalization + labor costs + digital payments + young owners
- ⚡ Biggest threat: Fast followers (KiotViet copying self-service) - speed is our only moat

**Strategic Imperative:** Move fast. Capture 1,000+ customers in 18 months before competitors respond.

---

## Strengths (Internal, Positive)

### S1: Price Advantage (99K vs 200-300K)

**Description:** 50-70% cheaper than entry-level competitors

**Strategic Implication:**
- Primary wedge for market entry
- Can undercut on price while maintaining margins
- Removes "too expensive" objection

**How to Exploit:**
- Lead with price in all marketing
- "Same essential features, half the price" positioning
- ROI calculator showing savings vs competitors

**Risk:** Race to bottom if competitors match price

**Mitigation:** Emphasize total cost (hardware + software), not just software price

---

### S2: Zero Hardware Requirement

**Description:** No upfront POS terminal, printer, or cash drawer investment

**Strategic Implication:**
- Zero barrier to entry (remove 3-5M initial cost)
- Psychological advantage (no sunk cost fear)
- Can cancel anytime without equipment loss

**How to Exploit:**
- Target shops 0-6 months old (haven't bought POS yet)
- "Try risk-free" messaging
- Show hardware cost comparison table

**Supporting Data:**
- KiotViet typical hardware bundle: 3.5M-5.5M
- ScanGo hardware cost: 0đ (customer uses own devices)

---

### S3: AI Profitability at Budget Tier

**Description:** Rule-based + LLM profit analysis at 99K tier (competitors charge 300K+ for this)

**Strategic Implication:**
- Unique in market at this price point
- Directly addresses ingredient volatility pain
- Creates "aha moment" for customers

**How to Exploit:**
- Case studies showing 10-15% profit increase
- Make AI insights the "upgrade to Pro" driver
- Content marketing: "Món nào đang âm thầm lỗ vốn?"

**Technical Moat:**
- Requires recipe-based inventory (complex to build)
- Requires LLM integration (expensive for competitors)
- Data advantage (more self-service orders = better insights)

---

### S4: NFC Anti-Fraud Technology

**Description:** One-time cryptographic tokens via NFC sticker tap

**Strategic Implication:**
- Technical differentiation competitors don't have
- Solves viral "fake order" prank problem
- Patent potential

**How to Exploit:**
- Emphasize in high-fraud areas (tourist districts, delivery-heavy)
- Technical blog posts (build credibility)
- Consider patent filing

**Cost:** NFC stickers ~3,000đ each (negligible)

---

### S5: Self-Service Architecture

**Description:** Built from ground-up for customer self-ordering, not staff-input

**Strategic Implication:**
- Core architectural advantage
- Eliminates entire labor category (cashier)
- Competitors can't match without complete rewrite

**How to Exploit:**
- ROI calculator: "Your cashier costs 5M, ScanGo costs 99K"
- Before/after customer journey comparison
- Time-to-order metrics (30s vs 4min)

**Defensibility:** High (requires architectural rebuild for competitors)

---

### S6: Web-Native Platform

**Description:** Progressive Web App, no native app required

**Strategic Implication:**
- Fast iteration (deploy features instantly)
- No app store approval delays
- Works on any device

**How to Exploit:**
- Ship features weekly (vs competitors' monthly/quarterly)
- "Always up-to-date, no app updates needed"
- Cross-platform advantage

**Trade-off:** Limited offline capability (acceptable for target market)

---

### S7: Modifier Accuracy (98% vs 85%)

**Description:** Customer self-input eliminates verbal miscommunication errors

**Strategic Implication:**
- 15% error rate → 2% error rate
- Each error costs 30-50K (remake + customer dissatisfaction)
- Direct cost savings

**How to Exploit:**
- Target coffee/tea shops specifically (high modifier complexity)
- Calculate error cost: 100 orders/day × 15% × 40K = 600K/day
- Customer testimonials about zero mistakes

**Proof Required:** Track mistake rate at pilot customers

---

### S8: Firebase Infrastructure

**Description:** Google Cloud auto-scaling, 99.95% SLA

**Strategic Implication:**
- Reliability advantage over self-hosted competitors
- Zero DevOps burden
- Scales automatically

**How to Exploit:**
- Emphasize "never crashes" vs local POS software
- Real-time updates (order status)
- No maintenance windows

**Risk:** Firebase pricing increases (mitigate with multi-tenant architecture)

---

## Weaknesses (Internal, Negative)

### W1: No Offline Mode (Web Limitation)

**Impact:** 
- Objection in 20% of sales calls
- Perceived as less reliable than native apps
- Competitor advantage in marketing

**Mitigation Strategy:**
1. **Reframe:** "Offline is 1% edge case, we optimize for 99% use case"
2. **Ethernet documentation:** Show 99.9% uptime with wired connection
3. **Offer upgrade:** $10 local server kit for Pro tier customers
4. **Data:** Track actual offline incidents (<0.5% of operating hours)

**When this becomes critical:** If >5% of lost deals cite offline as blocker

**Long-term solution:** Phase 2 local server option (Q1 2027)

---

### W2: No Brand Recognition

**Impact:**
- Higher Customer Acquisition Cost (CAC)
- Trust barrier (unknown startup vs established KiotViet)
- Longer sales cycles

**Mitigation Strategy:**
1. **Free tier:** Try before commit eliminates trust barrier
2. **Social proof:** Case studies, testimonials, video tours
3. **Content marketing:** Weekly shop features, owner interviews
4. **Local presence:** Tier 2 city focus (less competitive noise)
5. **Founder brand:** Personal story, technical credibility

**Measurement:** Track CAC reduction over time as brand builds

**Timeline:** Need 100+ customers for credible social proof (6 months)

---

### W3: Limited Features vs Enterprise POS

**Impact:**
- Can't compete for large restaurants (50+ tables)
- Can't compete for chains (yet)
- Feature comparison charts look worse

**Mitigation Strategy:**
1. **Don't compete there:** Own 1-15 table segment completely
2. **Anti-positioning:** "We're intentionally simple. Enterprise POS is overkill for small shops."
3. **Focus advantage:** Build deep features for core use case vs shallow features everywhere
4. **Future expansion:** White-label for chains (Q1 2027)

**Acceptance:** This is a feature, not a bug. Niche domination > broad mediocrity.

---

### W4: Web = Limited Hardware Access

**Impact:**
- Can't directly control Bluetooth printers
- Can't open cash drawers
- Can't use barcode scanners

**Mitigation Strategy:**
1. **Cloud Print:** Indirect printing via kitchen tablet
2. **Bluetooth bridge:** Kitchen tablet mediates printer connection
3. **Partnerships:** Work with printer manufacturers for web APIs
4. **Positioning:** "Zero hardware means zero hardware problems"

**Reality check:** Target customers (coffee shops) don't need cash drawers or scanners

---

### W5: Requires Customer Behavior Change

**Impact:**
- Some customers resist "scanning QR" vs ordering at counter
- Older demographic slower to adopt
- Staff training needed

**Mitigation Strategy:**
1. **Post-COVID normalization:** QR ordering is now standard (80% comfort rate)
2. **Signage templates:** Provide clear "Scan QR to order" materials
3. **Staff training guide:** How to help customers first time
4. **Hybrid option:** Staff can still input orders via tablet if customer insists

**Data point:** COVID killed this barrier for most demographics under 60

---

### W6: Firebase Vendor Lock-In

**Impact:**
- Migration cost if Firebase becomes too expensive
- Dependent on Google's pricing decisions
- Can't easily switch to self-hosted

**Mitigation Strategy:**
1. **Multi-tenant efficiency:** Per-shop cost decreases with scale
2. **Price monitoring:** Track Firestore costs weekly
3. **2x buffer:** Build pricing with 2x Firebase cost headroom
4. **Acceptance:** Firebase reliability > migration flexibility

**Risk level:** Low (Firebase pricing stable, decreasing over time)

---

### W7: Small Team = Limited Support

**Impact:**
- Can't offer 24/7 phone support
- Slower response times than enterprise competitors
- Scaling constraint

**Mitigation Strategy:**
1. **Self-service docs:** Comprehensive video tutorials, FAQs
2. **Community forum:** Customers help each other
3. **Async support:** Email/chat, response within 12 hours
4. **Premium support tier:** Charge 50K/month extra for priority support
5. **AI chatbot:** Handle common questions (future)

**Hiring plan:** 
- Month 6: First customer success hire (100+ customers)
- Month 12: Second CS hire (300+ customers)
- Ratio target: 1 CS per 150 customers

---

## Opportunities (External, Positive)

### O1: Tier 2 City Coffee Boom

**Size:** 5,000+ new coffee/tea shops per year in Đà Nẵng, Cần Thơ, Huế combined

**Why Now:**
- Rising disposable income in Tier 2 cities
- Coffee culture spreading beyond Hanoi/HCMC
- Young entrepreneurs returning from big cities

**How to Capture:**
1. **Geo-targeted ads:** Facebook "chủ quán cà phê [city name]"
2. **Local partnerships:** Coffee bean suppliers, interior designers
3. **Influencer testimonials:** Local coffee shop owners with social following
4. **City-by-city launch:** Focus one city at a time (Đà Nẵng first)

**Budget:** 10M/month per city (3 cities = 30M/month total)

**Expected CAC:** 300-500K per customer (lower than Tier 1 cities)

---

### O2: Post-COVID QR Normalization

**Impact:** 80%+ customers comfortable with QR ordering (up from 20% pre-2020)

**Why This Matters:**
- Eliminates adoption barrier
- "Already know how to do this" reduces training
- Perceived as modern, not gimmicky

**How to Capture:**
1. **Messaging:** "What worked during COVID now works better post-COVID"
2. **Trust signal:** QR = hygiene, safety (still resonates)
3. **Timing advantage:** Strike while QR acceptance is high

**Window:** 2-3 years before this becomes "table stakes" vs advantage

---

### O3: Rising Labor Costs

**Impact:** Minimum wage increased 15% in 2026, projected 10-12% annually

**Math:**
```
2026: Cashier salary 5.0M/month
2027: Cashier salary 5.75M/month (+15%)
2028: Cashier salary 6.4M/month (+13%)

ScanGo: 99K/month (fixed)

Year 1 savings: 4.9M/month
Year 2 savings: 5.65M/month (ROI improving)
```

**How to Capture:**
1. **ROI calculator:** Show multi-year savings projection
2. **Inflation protection:** "ScanGo cost stays flat while labor costs rise"
3. **Future-proofing:** "Invest now before next wage hike"

**Proof point:** Government minimum wage hike schedule (public data)

---

### O4: Ingredient Cost Volatility

**Impact:** Coffee beans +25%, milk +18%, sugar +12% in 2026

**Why AI Profitability Matters Now:**
- Shop owners getting squeezed on margins
- Many don't realize certain drinks now losing money
- Need to adjust prices but unsure which items

**How to Capture:**
1. **Content marketing:** "Giá sữa tăng 18%, món nào đang lỗ?"
2. **Blog series:** Ingredient inflation guides
3. **Case studies:** "How AI helped Quán ABC maintain margins"

**Timing:** Strike while inflation pain is fresh (next 6-12 months)

---

### O5: Young Owner Demographic

**Impact:** 60% of new coffee shops owned by 25-35 year olds

**Characteristics:**
- Digital natives (grew up with smartphones)
- Instagram/TikTok users (visual platforms)
- Open to trying new tools
- Price-sensitive (starting businesses)

**How to Capture:**
1. **Social media marketing:** Instagram Reels, TikTok
2. **Influencer partnerships:** Young successful shop owners
3. **Visual content:** Beautiful UI screenshots, video demos
4. **Community building:** "ScanGo shop owners" Facebook group

**Channel priority:** Instagram > Facebook > TikTok > Google Ads

---

### O6: Digital Payment Growth

**Impact:** VNPay/Momo/ZaloPay usage up 40% YoY

**Why This Matters:**
- Customers already have payment apps installed
- Frictionless checkout (no cash handling)
- Younger demographic prefers digital payments

**How to Capture:**
1. **Seamless integration:** One-click VNPay/Momo payment
2. **Marketing:** "Customers already use these apps daily"
3. **QR code unification:** Payment + ordering in one flow

**Partnership opportunity:** Co-marketing with VNPay (they want merchant adoption)

---

### O7: Street Food Formalization

**Impact:** Government "clean street food" initiative pushing vendors to formalize

**Opportunity:**
- Street food vendors need to appear "modern"
- Zero hardware advantage (they operate from carts)
- QR ordering = perceived sophistication

**How to Capture:**
1. **Specific street food template:** Cart-optimized UI
2. **Government relations:** Position as solution for formalization
3. **Case studies:** Successful street food transitions

**Market size:** 50,000+ street food vendors in Vietnam, 10% formalizing = 5,000 potential customers

**Timeline:** Q2 2027 (after coffee shop core is solid)

---

### O8: Food Court Expansion

**Impact:** New malls = new food courts, 20+ vendors per location

**Opportunity:**
- Multi-tenant architecture (one server, many shops)
- Centralized order display
- Individual shop dashboards

**How to Capture:**
1. **B2B sales:** Target mall developers directly
2. **Volume pricing:** 20 shops × 50K each = 1M/month per food court
3. **White-label option:** Mall-branded ordering system

**Market size:** 200+ malls in Vietnam, 50% with food courts = 100 potential deployments

**Timeline:** Q3 2027 (after multi-tenant architecture built)

---

### O9: White-Label for Local Chains

**Impact:** Local chains (5-20 locations) want branded POS solutions

**Opportunity:**
- Charge 10x for white-label (999K/month vs 99K)
- One sale = 100 regular customers in revenue
- Reference customer credibility

**How to Capture:**
1. **Outbound sales:** Target chains with 5+ locations
2. **Custom branding:** Their colors, logo, domain
3. **Dedicated support:** Premium tier included

**Market size:** 500+ local chains in Vietnam (3-20 locations each)

**Timeline:** Q1 2027 (need proof of concept with single shops first)

---

## Threats (External, Negative)

### T1: KiotViet Adds Self-Service Ordering

**Probability:** HIGH (80% within 18 months)

**Impact:** 
- Removes our primary differentiator
- They have brand recognition + sales team
- Can bundle with existing POS customers

**Mitigation Strategy:**
1. **Speed moat:** Capture 1,000+ customers before they respond (18 month window)
2. **AI emphasis:** They don't have AI at budget tier (we do)
3. **Data lock-in:** Make loyalty customer database valuable ("Your 500 customers = 10M marketing asset")
4. **Feature velocity:** Ship faster (weekly vs their quarterly releases)

**Our response messaging:**
> "We've been self-service from day one. They're bolting it onto a cashier-first system. That's why our customer ordering time is 30s vs their 2min—architecture matters."

**Strategic priority:** Move extremely fast in next 12-18 months

---

### T2: Free/Pirated POS Software

**Probability:** MEDIUM (40%)

**Impact:**
- Price competition at zero
- Appeals to cost-conscious owners
- Hard to compete on features vs free

**Mitigation Strategy:**
1. **Cloud architecture:** Can't pirate cloud services (Firebase, AI)
2. **Value = insights, not software:** "Free software gives you reports. We give you decisions."
3. **Support differentiation:** Free software = no support
4. **Security/reliability:** Pirated software has malware risk

**Reality check:** Free POS software exists now, but shops still pay for support + reliability

**Not worried:** Our target customer values time > money (would rather pay 99K than deal with free broken software)

---

### T3: Grab/Shopee In-Store Ordering

**Probability:** MEDIUM (50% they experiment with this)

**Impact:**
- Huge brand recognition
- Existing customer base (millions of users)
- Could dominate through network effects

**Mitigation Strategy:**
1. **Different focus:** They do aggregation (multi-shop), we do single-shop loyalty
2. **Partnership, don't compete:** Integrate with their APIs (be the POS for their in-store orders)
3. **Owner relationship:** We serve shop owner needs, they serve customer needs (complementary)

**Why they might not:** In-store ordering cannibalizes their delivery commissions (15-25%)

**Monitor:** Watch for pilots, pivot to integration if they launch seriously

---

### T4: Economic Downturn

**Probability:** MEDIUM (30% recession in next 2 years)

**Impact:**
- F&B spending decreases first
- Shop closures
- Reduced willingness to pay for software

**Mitigation Strategy:**
1. **Emphasize savings:** Recession makes labor savings MORE critical
2. **Pricing:** 99K is cheaper than keeping cashier (recession-proof value prop)
3. **Free tier:** Keep users in ecosystem even if they downgrade
4. **Survival positioning:** "Cut costs, not quality. ScanGo saves 5M/month."

**Historical precedent:** 2008 recession actually increased SaaS adoption (companies cut headcount, added software)

**Opportunity:** Downturn could accelerate our adoption (labor savings become critical)

---

### T5: Customer Privacy Concerns

**Probability:** LOW (10%)

**Impact:**
- Phone number collection for loyalty
- GDPR-style regulations coming to Vietnam
- Customer hesitation to share data

**Mitigation Strategy:**
1. **Optional loyalty:** Can order without phone number
2. **Transparency:** Clear privacy policy, data usage explanation
3. **OTP verification:** Shows we protect data (verify ownership)
4. **GDPR compliance:** Build with European standards from day one
5. **Data export:** Customer can download all their data anytime

**Regulatory monitoring:** Watch for Vietnam data protection law developments

---

### T6: Firebase Pricing Increases

**Probability:** LOW (10%) but HIGH IMPACT if it happens

**Impact:**
- Our margins depend on predictable Firebase costs
- 2x price increase = 99K pricing unsustainable

**Mitigation Strategy:**
1. **Multi-tenant architecture:** Share resources across tenants (lower per-shop cost)
2. **Price monitoring:** Weekly cost tracking per customer
3. **2x buffer:** Build pricing model with 2x Firebase cost assumption
4. **Pricing power:** Can increase to 129K if needed (still cheaper than competitors)

**Math:**
- Current Firebase cost per shop: ~20K/month (80% margin)
- 2x increase: ~40K/month (60% margin, still acceptable)
- Break-even: ~99K/month (would need to raise prices)

**Not worried:** Firebase pricing trending down over time, not up

---

### T7: Data Localization Laws

**Probability:** LOW (5%) but HIGH IMPACT

**Impact:**
- Vietnam might require data stored in-country
- Firebase doesn't have Vietnam region
- Would need to migrate to local cloud

**Mitigation Strategy:**
1. **Firebase Asia region:** Use Singapore region (closest)
2. **Monitor regulation:** Track Vietnamese data sovereignty bills
3. **Migration plan:** Have backup plan for local hosting (AWS Thailand, etc.)
4. **Partnership:** Work with local cloud providers if regulation passes

**Timeline:** Even if law passes, compliance grace period likely 12-24 months

---

## SWOT Strategic Matrix

### Strengths + Opportunities → Aggressive Strategies

#### Strategy 1: "First-Mover Tier 2 Blitz"
- **Strength:** Low price + zero hardware
- **Opportunity:** Tier 2 city boom
- **Action:** Facebook ad campaign targeting "chủ quán cà phê [Đà Nẵng/Cần Thơ/Huế]"
- **Budget:** 20M/month
- **Goal:** 100 new customers/month
- **KPI:** CAC <500K, payback <6 months

#### Strategy 2: "AI Profit Story"
- **Strength:** AI at budget tier
- **Opportunity:** Ingredient cost volatility
- **Action:** Content marketing: "Giá sữa tăng 18%, món nào của bạn đang lỗ?" Blog + YouTube
- **Budget:** 5M/month (content production)
- **Goal:** 50K organic traffic/month
- **KPI:** 5% conversion (blog → trial signup)

#### Strategy 3: "White-Label Land Grab"
- **Strength:** Web-native (easy customization)
- **Opportunity:** Local chains (5-20 locations)
- **Action:** Outbound sales to chains, offer branded version at 999K/month
- **Budget:** 1 sales hire + 10M/month comp
- **Goal:** 5 chain customers by Q2 2027
- **KPI:** 1 chain customer = revenue of 100 regular customers

---

### Weaknesses + Opportunities → Turnaround Strategies

#### Strategy 4: "Offline Perception Fix"
- **Weakness:** No offline mode
- **Opportunity:** Young tech-savvy owners
- **Action:** Educational content: "Offline mode là marketing gimmick. Đây là sự thật..." + ethernet guides
- **Budget:** 2M/month (video production)
- **Goal:** Reduce "offline objection" from 20% → 5% of sales calls
- **KPI:** Track objection frequency in sales notes

#### Strategy 5: "Trust Through Transparency"
- **Weakness:** No brand recognition
- **Opportunity:** Post-COVID content consumption
- **Action:** Weekly "Shop Tour Tuesday" - visit customers, show real results on YouTube/TikTok
- **Budget:** 3M/month (video production + travel)
- **Goal:** 10K YouTube subscribers by Q4 2026
- **KPI:** CAC decrease as brand awareness increases

---

### Strengths + Threats → Defensive Strategies

#### Strategy 6: "Speed Moat"
- **Strength:** Web-native fast iteration
- **Threat:** KiotViet copying self-service
- **Action:** Ship 1 major feature per month, stay 6-12 months ahead
- **Budget:** Dev team focus (no additional cost)
- **Goal:** Feature parity impossible for competitors
- **KPI:** Weekly deploys, customer feature request response time <2 weeks

#### Strategy 7: "Data Lock-In"
- **Strength:** Loyalty system (customer phone database)
- **Threat:** Competitors entering market
- **Action:** Make customer database valuable: "Your 500 phones = 10M marketing asset" + export/SMS tools
- **Budget:** 5M feature development
- **Goal:** Increase switching cost (customers won't leave their database behind)
- **KPI:** 90% of customers have >100 loyalty members after 6 months

---

### Weaknesses + Threats → Survival Strategies

#### Strategy 8: "Price Defense"
- **Weakness:** Small team = can't outspend on marketing
- **Threat:** KiotViet has enterprise sales force
- **Action:** Stay at 99K even if costs increase. Price is the wedge.
- **Budget:** Accept lower margins for market share
- **Goal:** Own "affordable POS" positioning permanently
- **KPI:** Never raise prices above 129K for entry tier

#### Strategy 9: "Niche Domination"
- **Weakness:** Limited features vs enterprise POS
- **Threat:** Can't compete with feature-rich competitors
- **Action:** Own coffee/tea segment completely. Don't chase restaurants/retail.
- **Budget:** Coffee shop-specific features only
- **Goal:** "Best POS for coffee shops" > "Okay POS for everything"
- **KPI:** 80% of customers are coffee/tea shops (focus validation)

---

## Risk Mitigation Priorities

### High Probability + High Impact = Critical Risks

**CR1: KiotViet adds self-service (80% probability, high impact)**
- Mitigation: Speed moat (capture 1,000 customers in 18 months)
- Contingency: Pivot to AI differentiation if they launch
- Monitoring: Watch their product updates monthly

### Medium Probability + High Impact = Important Risks

**IR1: Economic downturn (30% probability, high impact)**
- Mitigation: Emphasize savings (recession-proof value prop)
- Contingency: Free tier preserves user base if downgrade
- Monitoring: Vietnam GDP growth, F&B spending trends

**IR2: Grab/Shopee in-store ordering (50% probability, medium impact)**
- Mitigation: Integration strategy (partner, don't compete)
- Contingency: Offer to be their POS backend
- Monitoring: Watch for pilots in Singapore/Thailand first

### Low Probability + High Impact = Monitor Risks

**MR1: Firebase pricing increase (10% probability, high impact)**
- Mitigation: 2x cost buffer in pricing model
- Contingency: Raise prices to 129K if needed
- Monitoring: Firebase blog, cost tracking dashboard

**MR2: Data localization laws (5% probability, high impact)**
- Mitigation: Use Firebase Asia region
- Contingency: Migration plan to AWS Thailand
- Monitoring: Vietnamese legislative tracker

---

## Success Metrics (How We Know SWOT Analysis Is Accurate)

### Strengths Validation
- [ ] 50% of sales calls mention "price advantage" as decision factor
- [ ] 30% of customers cite "no hardware" as top benefit
- [ ] 80% of Pro tier customers use AI insights weekly
- [ ] <2% churn rate (indicates strong product-market fit)

### Weaknesses Validation
- [ ] 20% of lost deals cite "offline mode" as blocker (if higher, need local server urgently)
- [ ] CAC >1M indicates brand weakness (target: <500K)
- [ ] If >30% churn in first 3 months = feature gaps
- [ ] Support ticket volume >10/day per 100 customers = need more docs

### Opportunities Validation
- [ ] 60%+ of customers from Tier 2 cities (validates geographic opportunity)
- [ ] 40%+ of new shops are 0-6 months old (validates "no POS yet" segment)
- [ ] Labor cost mentioned in 70%+ of sales conversations (validates economic opportunity)

### Threats Validation
- [ ] Monitor KiotViet product updates monthly (if self-service appears, threat realized)
- [ ] Track competitor pricing (if they go <99K, price war begins)
- [ ] GDP growth <2% = recession threat activated
- [ ] Firebase cost trend (if increasing >10%/year, pricing risk)

---

## Quarterly SWOT Review Schedule

**Q3 2026 (Current):** Initial SWOT based on market research

**Q4 2026:** Update with first 50 customer data
- Which strengths actually drove sales?
- Which weaknesses caused lost deals?
- Which opportunities converted?
- Any threats materialized?

**Q1 2027:** Update with 200 customer data
- Validate/adjust strategic priorities
- Kill strategies that didn't work
- Double down on what's working

**Q2 2027:** Major SWOT refresh (12 month mark)
- Has competitive landscape changed?
- New opportunities emerged?
- Original weaknesses resolved?

---

## Next Actions

- [ ] Create metrics dashboard tracking SWOT validation criteria
- [ ] Set up competitor monitoring (KiotViet, Sapo product updates)
- [ ] Monthly SWOT review meeting (adjust strategies based on data)
- [ ] Link each strategic priority to specific SWOT element

---

**Related Documents:**
- USP.md - Unique Selling Proposition
- STRATEGIC_PRIORITIES.md - Quarterly execution roadmap
- COMPETITOR_ANALYSIS.md - Detailed competitor tracking
