# DR-001j — SRS, traceability, module doc

> **Ticket này chạy HAI GIAI ĐOẠN, không phải một.**
> **Giai đoạn 1 — làm TRƯỚC DR-001a:** thêm REQ-RPT-003 và REQ-RPT-004 vào SRS §4.7.
> `AGENTS.md` cấm implement khi chưa có REQ ID được duyệt, nên DR-001e/f/i **không được bắt đầu**
> trước khi giai đoạn 1 xong. Không có giai đoạn 1 thì cả đợt vi phạm quy tắc của chính repo.
> **Giai đoạn 2 — làm SAU DR-001i:** bằng chứng traceability + module doc.

## Requirement links

REQ-RPT-001 (đóng lỗ hổng acceptance), REQ-RPT-003, REQ-RPT-004, REQ-AI-008, NFR-MOD-001.

## Owning module

Tài liệu. Không đụng mã nguồn.

## Allowed file paths

- `docs/SRS.md`
- `docs/traceability.md`
- `docs/module/reporting.md`

Do not touch `docs/plan/` hay `docs/tickets/` (chúng là hồ sơ của đợt, không phải sản phẩm).
**Giai đoạn 2 làm cuối cùng** — `docs/SRS.md` đang được một đợt khác sửa song song (rủi ro R1/R2 của plan).

## Dependencies

- **Giai đoạn 1:** None. **Chặn DR-001a…DR-001i.**
- **Giai đoạn 2:** DR-001a … DR-001i.

## Atomic acceptance checklist

**Giai đoạn 1 — trước mọi ticket khác**

- Given REQ-RPT-003 và REQ-RPT-004, when thêm vào SRS, then mỗi cái nằm ở §4.7 với nguyên văn SHOULD + Acceptance đã soạn trong spec DR-001.
- Given SRS §1.5 (*"IDs are stable and never reused"*), when thêm, then không đụng ID nào đã có và không nhảy số.
- Given hai REQ mới, when kiểm, then `grep -n "REQ-RPT-003\|REQ-RPT-004" docs/SRS.md` trả về **cả hai**.
- Given chưa có hai REQ này, when bắt đầu DR-001a, then **dừng** — vi phạm `AGENTS.md`.

**Giai đoạn 2 — sau DR-001i**

- Given `docs/traceability.md`, when cập nhật, then có dòng cho REQ-RPT-003, REQ-RPT-004 và dòng REQ-RPT-001 được bổ sung bằng chứng bảng theo bàn.
- Given `docs/module/reporting.md`, when cập nhật, then mục **Queries** nêu chỉ số dẫn xuất và so sánh kỳ trước, và mục **Rules** nêu rõ Reporting được đọc `catalog`, `inventory`, `config` **chỉ để đếm độ phủ**, không sở hữu và không ghi.
- Given quy tắc nhãn độ phủ, when ghi vào module doc, then nêu rõ đây là quy tắc bắt buộc cho mọi chỉ số lợi nhuận thêm sau này.
- Given REQ-AI-008 đã được thêm ngày 2026-10-13 với trạng thái PARTIAL, when rà lại, then trạng thái vẫn đúng với bằng chứng thực tế (PARTIAL cho tới khi có test cho nhánh low-margin).
- Given REQ-RPT-001, when đọc dòng traceability, then nêu bằng chứng bảng theo bàn và không còn là "Done" thiếu căn cứ.
- Given `grep -n "REQ-RPT-003\|REQ-RPT-004" docs/SRS.md docs/traceability.md`, when chạy, then trả về **cả hai** file.

## Test plan

- Manual (giai đoạn 1): `grep -n "REQ-RPT-003\|REQ-RPT-004" docs/SRS.md` trả về hai dòng ở §4.7.
- Manual (giai đoạn 2): `grep -n "REQ-RPT-003\|REQ-RPT-004\|REQ-AI-008" docs/SRS.md docs/traceability.md` trả về đủ cả hai file.
- Manual: đọc lại §4.7 và §15 xem ID có trùng hoặc nhảy số không (SRS §1.5).
- Verify: `git diff --stat` chỉ có 3 file tài liệu trong danh sách trên.
