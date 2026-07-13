# ScanGo - Unique Selling Proposition (USP)

**Document Version:** 1.0  
**Last Updated:** 2026-07-12  
**Status:** Active

---

## Primary USP

### Vietnamese
> **"Khách tự order qua QR trong 30 giây. Bớt 1 thu ngân = tiết kiệm 5 triệu/tháng."**

### English
> **"Customers self-order via QR in 30 seconds. Eliminate 1 cashier = save 5M VND/month."**

---

## Why This USP Works

✅ **Quantifiable:** 30 seconds, 5M savings (provable)  
✅ **Pain-focused:** Solves labor cost problem (biggest expense)  
✅ **Outcome-based:** Not about features, about business results  
✅ **Defensible:** Competitors can't easily match without architectural rebuild

---

## Four Pillars of Differentiation

### 1. Self-Service Ordering (Primary)

**The Problem:**
```
Traditional Flow:
Customer → Queue (2 min) → Order verbally (1 min) → Cashier inputs (30s) → Kitchen
= 3.5-4 minutes, labor-intensive, 15% error rate

ScanGo Flow:
Customer → Scan QR (3s) → Select items (30s) → Kitchen instantly
= 33 seconds, zero labor, 2% error rate
```

**Defensibility:** Competitors' POS systems architecturally designed for staff input. True self-service requires core product rewrite.

**Target Customer Pain:** Labor costs 5M/month, difficult to find reliable staff

---

### 2. AI Profitability Analysis (Secondary)

**The Problem:**
- Shop owners see revenue reports, not profit
- Don't know which menu items actually make money
- Ingredient price changes eat margins silently

**ScanGo Solution:**
```
Traditional: "Hôm nay bán 47 ly Trà Đào, doanh thu 1.5 triệu"

ScanGo AI: "Trà Đào đang lỗ 8K/ly vì giá chanh tăng.
            Gợi ý: Tăng giá 5K (35K → 40K) 
            Hoặc: Thay chanh bằng cam (lời 12K/ly)"
```

**Defensibility:** 
- Requires recipe-based inventory (competitors don't have at budget tier)
- Requires LLM interpretation (expensive for competitors to add)
- Only meaningful with sufficient order volume (self-service generates more data)

**Target Customer Pain:** Ingredient volatility (milk +18%, coffee +25% in 2026)

---

### 3. Zero Hardware Lock-In (Psychological)

**The Problem:**
```
KiotViet/Sapo Commitment:
- POS terminal: 3,500,000đ
- Printer: 2,000,000đ  
- Software: 250,000đ/month

Cancel after 3 months?
→ Lost 5.5M in sunk hardware cost
→ Psychological barrier to trying
```

**ScanGo Reality:**
```
Month 1: 99,000đ
Month 2: 99,000đ
Month 3: 99,000đ

Cancel after 3 months?
→ Lost 297,000đ total
→ Zero sunk cost, walk away clean
```

**Defensibility:** Competitors' business model depends on hardware margins (30-40% of revenue). Can't match without revenue collapse.

**Target Customer Pain:** Fear of commitment (F&B has 40% failure rate in first year)

---

### 4. NFC Anti-Fraud (Technical)

**The Problem:**
- Customer shares QR code link on social media
- Friends order "ghost orders" from home to prank
- Restaurant makes food, no one picks up = loss

**Traditional Solution:**
- Staff manually verify customer is at table
- Defeats purpose of self-service

**ScanGo Solution:**
- NFC sticker at table generates one-time token
- Token expires in 30 seconds
- Cryptographically impossible to fake from remote location

**Defensibility:**
- Requires NFC implementation + cryptographic token system
- Competitors focused on "offline mode" instead
- Patent potential

**Target Customer Pain:** Viral "fake order" pranks (common in Vietnam social media)

---

## How to Communicate (Marketing Hierarchy)

### Level 1: Landing Page Hero (3 second attention)
```
Headline: "Khách Tự Order. Bớt 1 Thu Ngân."
Subhead: "Từ 99K/tháng. Không cần máy POS."
CTA: "Dùng thử 30 ngày miễn phí"
```

### Level 2: Value Proposition (30 second pitch)
```
Quán cà phê/trà sữa 10 bàn thường cần:
❌ 1 thu ngân (5M/tháng)
❌ 1 máy POS (3.5M một lần)
❌ Huấn luyện nhân viên mới (2M mỗi lần)

Với ScanGo:
✅ Khách tự gọi món qua QR
✅ AI báo món nào lời/lỗ
✅ Tích điểm khách quen tự động
= 99K/tháng. Tiết kiệm 5M/tháng.

ROI: 50x
```

### Level 3: Case Study (5 minute proof)
```
Quán Trà Sữa ABC (Đà Nẵng, 12 bàn)

TRƯỚC SCANGO:
- Thu ngân: 5,000,000đ/tháng
- Sai order: 5 đơn/ngày × 40,000đ = 6,000,000đ/tháng
- Không biết món nào lời/lỗ
Total cost: 11,000,000đ/tháng

SAU SCANGO (3 tháng):
- Bớt thu ngân: Tiết kiệm 5,000,000đ
- Sai order: 0 (khách tự chọn = 100% chính xác)
- AI phát hiện 3 món lỗ vốn → Tăng lợi nhuận 15%
- Chi phí ScanGo: 99,000đ
Net savings: 10,901,000đ/tháng

ROI: 110x
Payback period: Ngay tháng đầu
```

---

## Target Customer Segments (Priority Order)

### Primary: Độc lập Trà Sữa / Cafe (5-15 bàn)

**Characteristics:**
- Monthly revenue: 30-80M VND
- Current system: Paper orders or basic calculator
- Owner age: 25-40 (tech-comfortable)
- Location: Tier 2 cities (Đà Nẵng, Cần Thơ, Huế)
- Pain: Order mistakes, can't track profitability

**Why Perfect Fit:**
- High modifier complexity (size/sugar/ice) = self-service advantage
- Daily repeat customers = loyalty system valuable
- Young owners = QR adoption easy
- Labor cost = 30-40% of revenue = huge savings potential

### Secondary: Quán Ăn / Quán Cơm (3-10 bàn)

**Characteristics:**
- Monthly revenue: 20-50M VND
- Simple menu (5-15 items)
- Owner age: 30-50
- Location: Residential areas
- Pain: Peak hour bottleneck, inventory waste

**Why Good Fit:**
- Kitchen Display + Auto-86 solves real pain
- Lower tech comfort = need more onboarding support
- Recipe-based inventory critical (fresh ingredients)

### Tertiary: Street Food Formalization

**Characteristics:**
- Government "clean street food" program
- Transitioning from cash-only to formal business
- Young vendors (20-35)
- Pain: Need to appear "modern" to attract customers

**Why Future Opportunity:**
- QR ordering = perceived sophistication
- Zero hardware = affordable entry
- Mobile-first = matches their setup

---

## Competitive Positioning Statement

**For coffee and tea shop owners (1-15 tables) who are tired of rising labor costs and order mistakes,**

**ScanGo is a self-service ordering system that eliminates the cashier bottleneck and shows you which menu items are actually profitable,**

**Unlike traditional POS systems (KiotViet, Sapo, iPOS) which still require staff to input orders and only show revenue reports,**

**ScanGo lets customers order directly in 30 seconds while AI tells you daily which drinks are losing money—all for 99K/month with zero hardware investment.**

---

## Anti-Positioning (What We're NOT)

❌ **Not a traditional POS system** (we eliminate the POS operator)  
❌ **Not for large restaurants** (1-15 tables only, not 50+ table operations)  
❌ **Not for retail shops** (designed specifically for F&B with modifiers)  
❌ **Not feature-complete** (intentionally minimal, not "enterprise-grade")  
❌ **Not for chains** (yet—white-label coming Q1 2027)

---

## Proof Points (Must Have for Credibility)

### Quantitative Proof
- [ ] 3 case studies with real numbers (revenue before/after)
- [ ] Video testimonials from shop owners
- [ ] ROI calculator on website (input your costs → see savings)
- [ ] Public metrics dashboard (total orders processed, average order time)

### Qualitative Proof
- [ ] Weekly "Shop Tour" videos (YouTube/TikTok)
- [ ] Screenshot library (real dashboards, anonymized)
- [ ] Founder story (why I'm solving this problem)
- [ ] Technical blog (how NFC security works, etc.)

---

## Messaging Do's and Don'ts

### ✅ DO:
- Lead with business outcome ("tiết kiệm 5M/tháng")
- Use customer language ("bớt thu ngân" not "optimize labor allocation")
- Show, don't tell (screenshots, videos, live demos)
- Emphasize speed ("30 giây" not "fast")
- Compare to status quo (cashier vs self-service)

### ❌ DON'T:
- Lead with features ("We have AI!")
- Use technical jargon ("Cloud-native Firebase architecture")
- Compare to competitors by name (focus on old way vs new way)
- Claim "best" or "number one" (new brand, no credibility yet)
- Over-promise (under-promise, over-deliver)

---

## USP Evolution Timeline

### Now (Jul 2026): "Tiết kiệm lao động"
Focus: Labor cost savings

### Q4 2026: "AI giúp nhìn ra tiền"  
Add: Profitability insights as customers have 3+ months data

### Q2 2027: "Hệ sinh thái khách hàng"
Add: Loyalty network effects ("500 khách thân thiết = tài sản 10M")

### 2028: "Nền tảng kinh doanh F&B"
Expand: Beyond ordering (supply chain, staffing, etc.)

---

## Competitive Response Scenarios

### If KiotViet adds self-service:
**Our response:** "We've been self-service from day one. They're bolting it onto a cashier-first system. That's why our AI is better—3 years of pure self-service data."

### If competitor goes cheaper (79K/month):
**Our response:** "Price isn't the point. ROI is. We save you 5M/month. Would you save 20K/month on software to lose 5M/month on labor?"

### If competitor claims better features:
**Our response:** "We're not trying to have the most features. We're trying to eliminate your cashier. That's it. Everything else is distraction."

---

## Next Actions

- [ ] Create landing page with hero USP (3 second version)
- [ ] Record 1-minute explainer video (30 second pitch version)
- [ ] Get 3 pilot customers for case studies (5 minute proof version)
- [ ] Build ROI calculator (quantitative proof)
- [ ] Launch "Shop Tour Tuesday" YouTube series (qualitative proof)

---

**Related Documents:**
- SWOT.md - Strengths, Weaknesses, Opportunities, Threats analysis
- STRATEGIC_PRIORITIES.md - Quarterly execution roadmap
- POSITIONING_STATEMENT.md - One-pagers for different audiences
