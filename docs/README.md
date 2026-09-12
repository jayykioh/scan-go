# ScanGo Strategic Documentation

**Version:** 1.1  
**Date:** 2026-09-12  
**Status:** Approved foundation with pre-launch strategy

---

## 📋 Document Overview

This folder contains the complete strategic planning documentation for ScanGo, a self-service ordering system for Vietnamese coffee and tea shops.

### Quick Navigation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[SRS.md](SRS.md)** | Approved product requirements | Design, implementation, QA, acceptance |
| **[TECH_STACK.md](TECH_STACK.md)** | Binding technology choices | Architecture and implementation |
| **[RULES.md](RULES.md)** | Common delivery rules | All changes |
| **[RULES_FIREBASE.md](RULES_FIREBASE.md)** | Active Firestore rules | Data and backend changes |
| **[glossary.md](glossary.md)** | Approved product terms | All product communication |
| **[ADR 0001](adr/0001-use-firestore-and-cloud-functions.md)** | Firestore and Cloud Functions | Database changes |
| **[ADR 0002](adr/0002-use-independent-product-modules.md)** | Independent modules | Module boundary changes |
| **[ADR 0003](adr/0003-use-layered-configuration.md)** | Layered configuration | Configuration changes |
| **[ADR 0004](adr/0004-protect-payment-and-order-history.md)** | Payment and order history | Financial record changes |
| **[USP.md](USP.md)** | Unique Selling Proposition | Writing marketing copy, sales pitches, positioning |
| **[SWOT.md](SWOT.md)** | Strategic analysis | Quarterly reviews, investor updates, risk assessment |
| **[PESTEL.md](PESTEL.md)** | Macro-environment analysis | Quarterly strategy reviews, investor discussions, regulatory tracking |
| **[STRATEGIC_PRIORITIES.md](STRATEGIC_PRIORITIES.md)** | 12-month execution roadmap | Sprint planning, team alignment, milestone tracking |
| **[POSITIONING_STATEMENT.md](POSITIONING_STATEMENT.md)** | Audience-specific messaging | Customer pitches, press releases, recruitment |

---

## 🎯 Mission Statement

**Become the default ordering system for 1-15 table coffee and tea shops in Vietnam.**

We do this by eliminating the cashier bottleneck through QR self-service ordering and providing AI-powered profitability insights that help shop owners make better decisions.

---

## 💡 Core Value Proposition

### For Coffee Shop Owners:
> "Khách tự order qua QR trong 30 giây. Bớt 1 thu ngân = tiết kiệm 5 triệu/tháng."

**Translation:** Customers self-order via QR in 30 seconds. Eliminate 1 cashier = save 5M VND/month.

### Three Pillars:
1. **Self-Service Ordering** → Eliminate labor cost (5M/month savings)
2. **AI Profitability Insights** → Know which drinks make money (10-15% margin increase)
3. **Zero Hardware** → No upfront cost (vs 3-5M for traditional POS)

---

## 📊 Key Metrics (12-Month Targets)

| Metric | Q3 2026 | Q4 2026 | Q1 2027 | Q2 2027 |
|--------|---------|---------|---------|---------|
| **Paying Customers** | 50 | 200 | 500 | 1,000 |
| **MRR** | 5M | 20M | 50M | 100M |
| **CAC** | Under validation | <500K | <500K | <400K |
| **Churn Rate** | <5% | <3% | <3% | <2% |
| **LTV/CAC** | Under validation | >3x | >3x | >5x |

---

## 🗺️ Strategic Roadmap (High-Level)

### Phase 1: Launch + Validation (Q3 2026)
**Goal:** Prove product-market fit
- 50 paying customers
- 3 case studies with ROI proof
- <5% monthly churn

### Phase 2: Scale + Proof (Q4 2026)
**Goal:** Prove scalability
- 200 paying customers
- CAC <500K validated
- Pro tier launched (199K/month)

### Phase 3: Moat Building (Q1 2027)
**Goal:** Build defensibility
- 500 paying customers
- Integration partnerships (VNPay, printers)
- White-label offering for chains

### Phase 4: Expand or Defend (Q2 2027)
**Goal:** Market leadership
- 1,000 paying customers OR defend against competitors
- 100M MRR
- Scenario planning based on competitive response

---

## 🎯 Target Customer Profile

### Primary: Độc lập Coffee/Tea Shops

**Demographics:**
- Size: 5-15 tables
- Revenue: 30-80M VND/month
- Location: Tier 2 cities (Đà Nẵng, Cần Thơ, Huế)
- Owner age: 25-40 years old
- Tech comfort: Medium to high

**Psychographics:**
- First-time business owners (fear of commitment)
- Price-sensitive (low budget for tech)
- Quality-focused (want happy customers)
- Growth-oriented (open to trying new things)

**Pain Points:**
- Labor costs rising (5M/month for cashier)
- Order mistakes during peak hours (15% error rate)
- Don't know which menu items are profitable
- Can't afford 3-5M POS hardware investment

---

## 🏆 Competitive Positioning

### vs. Traditional POS (KiotViet, Sapo, iPOS)

| Dimension | Competitors | ScanGo | Winner |
|-----------|-------------|--------|--------|
| **Entry cost** | 3-5M hardware | 0đ | ✅ ScanGo |
| **Monthly cost** | 200-300K | 99K | ✅ ScanGo |
| **Self-service** | ❌ (staff input) | ✅ (customer direct) | ✅ ScanGo |
| **AI insights** | ❌ (premium tier) | ✅ (included) | ✅ ScanGo |
| **Setup time** | 2-3 days | 2 hours | ✅ ScanGo |
| **Offline mode** | ✅ (native app) | ❌ (web) | ❌ Competitor |
| **Brand trust** | ✅ (established) | ❌ (new) | ❌ Competitor |

**Strategic Decision:** Win on cost, speed, and self-service. Accept limitations on offline and brand.

---

## 💰 Unit Economics

### Revenue Model

**ARPU (Average Revenue Per User):**
- Lite tier (80% of customers): 99K/month
- Pro tier (20% of customers): 199K/month
- Blended ARPU: 120K/month

**LTV (Lifetime Value):**
- Average retention: 30 months
- LTV = 30 months × 120K = 3.6M VND

### Cost Structure

**Variable Costs (per customer per month):**
- Firebase (database, hosting, functions): 15K
- AI API costs (Gemini): 5K (Pro tier only)
- Payment processing (2% of transactions): 5K
- **Total COGS:** 25K/customer/month
- **Gross Margin:** 79% (95K profit per 120K revenue)

**Fixed Costs (monthly at 1,000 customers):**
- Team salaries (5 people): 80M
- Marketing: 30M
- Infrastructure: 10M
- Operations: 5M
- **Total Fixed:** 125M/month

**Break-Even:**
- Fixed costs: 125M
- Gross profit per customer: 95K
- Break-even customers: 125M ÷ 95K = **1,316 customers**
- Timeline: Month 13-14 (Q2 2027)

### CAC (Customer Acquisition Cost)

**Target:** <500K per customer

**Channels & CAC:**
- Facebook Ads: 400K (proven in testing)
- Content Marketing: 200K (organic conversions)
- Referrals: 100K (incentive costs only)
- Blended CAC: 300-400K

**Payback Period:**
- CAC: 400K
- Monthly gross profit: 95K
- Payback: 4.2 months

**LTV/CAC Ratio:**
- LTV: 3.6M
- CAC: 400K
- Ratio: **9x** (excellent, >3x is healthy)

---

## 🚀 Go-to-Market Strategy

### Geographic Focus (Priority Order)

**Tier 2 Cities First (Lower Competition, Higher ROI):**
1. **Đà Nẵng** (Q3 2026) - Founder based here, easy to support
2. **Cần Thơ** (Q4 2026) - Mekong Delta coffee culture
3. **Huế** (Q4 2026) - Growing food scene
4. **Nha Trang** (Q1 2027) - Tourist + local mix
5. **Vũng Tàu** (Q1 2027) - Weekend destination
6. **Đà Lạt** (Q2 2027) - Coffee production center

**Why NOT Hanoi/HCMC First:**
- Higher competition (KiotViet/Sapo have strong presence)
- Higher CAC (more expensive ads)
- Less founder advantage (can't visit customers easily)
- Strategy: Enter after Tier 2 dominance (Year 2)

### Channel Strategy

**Phase 1 (Q3 2026): Direct + Manual**
- Founder visits shops in person
- Free setup support
- Deep learning from pilots

**Phase 2 (Q4 2026): Paid + Content**
- Facebook Ads (60% of budget)
- Content Marketing (30%)
- Referral Program (10%)

**Phase 3 (Q1 2027): Partnerships**
- Payment providers (VNPay, Momo)
- Printer manufacturers
- Coffee bean suppliers

**Phase 4 (Q2 2027): Sales Team**
- Hire 1-2 sales reps for white-label (chains)
- Outbound B2B sales
- Enterprise pricing (999K/month)

---

## ⚠️ Key Risks & Mitigation

### Risk 1: KiotViet Adds Self-Service (HIGH probability)

**Mitigation:**
- Move fast: Capture 1,000 customers before they react (18 months)
- Emphasize AI differentiation (we have data, they don't)
- Lock-in via loyalty database (customers won't abandon their data)

### Risk 2: Economic Downturn (MEDIUM probability)

**Mitigation:**
- Emphasize savings (recession makes labor cost reduction MORE critical)
- Free tier preserves users in ecosystem
- 99K is cheaper than keeping cashier

### Risk 3: Offline Mode Objections (MEDIUM impact)

**Mitigation:**
- Ethernet documentation (99% uptime)
- $10 local server option (Android phone)
- Reframe: "Optimize for 99% use case, not 1% edge case"

### Risk 4: No Brand Recognition (HIGH impact early)

**Mitigation:**
- Over-invest in case studies and testimonials
- Free tier enables risk-free trial
- Video content (Shop Tour Tuesday) builds trust

---

## 📈 Success Criteria (When to Pivot)

### Product-Market Fit Signals (Q3 2026)
✅ **Continue if:**
- Churn <5%
- 70%+ of pilots actively using after 1 month
- Organic word-of-mouth starting (1+ referrals)

❌ **Pivot if:**
- Churn >10% (product doesn't solve real problem)
- Setup time >2 hours (too complex)
- Customers cite major missing feature repeatedly

### Scalability Signals (Q4 2026)
✅ **Continue if:**
- CAC <500K proven at scale
- Free → Lite conversion >15%
- Referral program generating 10+ referrals

❌ **Pivot if:**
- CAC >800K for 3 consecutive months
- Customer feedback: "Missing [critical feature]" from 50%+ customers

### Market Leadership Signals (Q2 2027)
✅ **Success if:**
- 1,000+ customers reached
- Competitors haven't responded yet
- Press coverage (TechInAsia, e27)

⚠️ **Defend if:**
- Competitor launches self-service
- Need to shift from growth to retention
- Execute Scenario B in Strategic Priorities

---

## 🛠️ How to Use This Documentation

### For Product Planning
1. Read **USP.md** → Understand core value proposition
2. Read **STRATEGIC_PRIORITIES.md** → See quarterly roadmap
3. Prioritize features that support USP
4. Check SWOT regularly: Are we addressing weaknesses?

### For Marketing
1. Read **USP.md** → Get messaging framework
2. Read **POSITIONING_STATEMENT.md** → Find audience-specific copy
3. Use case studies and ROI calculator
4. Track: Does our messaging match customer pain points? (from SWOT)

### For Sales
1. Read **POSITIONING_STATEMENT.md** → Customer pitch script
2. Use ROI calculator (in USP.md)
3. Address objections (in SWOT Weaknesses section)
4. Share case studies

### For Fundraising
1. Read **POSITIONING_STATEMENT.md** → Investor pitch section
2. Reference metrics from **STRATEGIC_PRIORITIES.md**
3. Show unit economics (in this README)
4. Emphasize competitive moats (from SWOT)

### For Team Alignment
1. Monthly: Review current quarter priorities (STRATEGIC_PRIORITIES.md)
2. Quarterly: Full SWOT review (adjust strategies based on data)
3. Weekly: Check KPIs vs targets
4. Daily: Build features that support USP

---

## 📅 Review Schedule

### Monthly Review (First Monday of Each Month)
**Attendees:** Founder + Team  
**Agenda:**
- Review previous month metrics vs targets
- Adjust current quarter priorities if needed
- Share learnings (what worked, what didn't)

**Questions:**
- Are we on track for quarterly goals?
- What's blocking progress?
- What should we start/stop/continue?

### Quarterly Review (Last Week of Quarter)
**Attendees:** Founder + Team + Advisors (if any)  
**Agenda:**
- Full SWOT review (update with new data)
- Next quarter planning
- Budget reallocation
- Hire/fire decisions

**Questions:**
- Did our assumptions hold true?
- What surprised us?
- What should we change for next quarter?

### Annual Review (End of Q2 2027)
**Attendees:** Founder + Team + Board (if any)  
**Agenda:**
- Full strategic reset
- Year 2 planning
- Funding decisions (raise Series A?)
- Team scaling plan

---

## 📞 Contact & Ownership

**Document Owner:** Founder  
**Last Updated:** 2026-07-12  
**Next Review:** 2026-08-12 (Monthly review)

**For Questions:**
- Strategic direction: [Founder email]
- Product roadmap: [Engineering lead email]
- Marketing execution: [Marketing lead email]

**Version Control:**
- All documents in `/docs` folder
- Use Git for version tracking
- Major changes require team discussion

---

## 🔄 Document Update Process

### When to Update

**Monthly:** Metrics, KPIs, progress tracking  
**Quarterly:** SWOT analysis, strategic priorities  
**As Needed:** USP (if positioning changes), Positioning Statements (new audiences)

### How to Update

1. Create branch: `git checkout -b update-docs-[date]`
2. Make changes with clear commit messages
3. Review with team (if major changes)
4. Merge to main: `git merge update-docs-[date]`
5. Tag version: `git tag v1.1 -m "Q4 2026 update"`

### What NOT to Change Without Discussion

- Core USP (this is strategic, not tactical)
- Target customer profile (requires market validation)
- Pricing tiers (affects all customers)
- 12-month goals (need team buy-in)

---

## 📚 Additional Resources

### External References
- Market research: `research/vietnam-coffee-market-2026.pdf`
- Competitor analysis: `research/competitor-feature-comparison.xlsx`
- Customer interviews: `research/pilot-interviews/`

### Internal Tools
- Analytics dashboard: [link to Firebase Analytics]
- Customer database: [link to Firestore console]
- Support tickets: [link to support system]
- Financial model: `finance/scango-unit-economics.xlsx`

### Learning Resources
- Firebase documentation: https://firebase.google.com/docs
- Vietnamese F&B industry: https://vietnambiz.vn
- SaaS metrics: https://saastr.com

---

## 🎯 Current Status (as of 2026-07-12)

**Phase:** Pre-Launch  
**Focus:** Product development → Pilot customer acquisition  
**Next Milestone:** 50 paying customers by end of Q3 2026  
**Blocker:** None (on track)

**This Week's Priorities:**
1. Finalize landing page (USP messaging from USP.md)
2. Identify 10 pilot shops in Đà Nẵng
3. Create setup video tutorial
4. Test VNPay payment integration

**This Month's Goal:**
- Launch Free + Lite tiers publicly
- Sign first 10 pilot customers
- Collect initial feedback

---

## ✅ Quick Start Checklist

**New Team Member Onboarding:**
- [ ] Read this README (you're here!)
- [ ] Read USP.md (understand what we're selling)
- [ ] Read your role-specific section in POSITIONING_STATEMENT.md
- [ ] Review current quarter priorities in STRATEGIC_PRIORITIES.md
- [ ] Join weekly team sync
- [ ] Get access to tools (Firebase, analytics, support)

**New Advisor/Investor:**
- [ ] Read USP.md (value proposition)
- [ ] Read SWOT.md (understand risks and opportunities)
- [ ] Read investor section in POSITIONING_STATEMENT.md
- [ ] Review unit economics in this README
- [ ] Schedule 1:1 with founder

**New Customer:**
- [ ] Read customer pitch in POSITIONING_STATEMENT.md
- [ ] Watch 2-minute demo video (link in USP.md)
- [ ] Sign up for free trial: scango.vn
- [ ] Schedule onboarding call

---

## 📖 Document Change Log

### Version 1.0 (2026-07-12)
- Initial strategic documentation package
- USP, SWOT, Strategic Priorities, Positioning Statements created
- Pre-launch planning phase completed
- Ready for execution

### Future Versions
- v1.1: After 50 customers (update metrics, validate assumptions)
- v1.2: After 200 customers (refine positioning based on data)
- v2.0: After Q2 2027 (major strategic reset for Year 2)

---

**Last Updated:** 2026-07-12  
**Document Status:** ✅ Active - Ready for Use

---

**Remember:** Strategy documents are living artifacts. They should be updated regularly based on real-world data, not set in stone. The best plan is the one that adapts to reality while staying true to core mission.

**Core Mission (Never Changes):**  
Help small Vietnamese coffee shops thrive by eliminating labor dependency and providing data-driven business insights.

**Tactics (Change Based on Data):**  
Everything else in these documents.

---

*Let's build something that matters. 🚀*
