// ==========================================
// CRC-16/CCITT-FALSE (Poly: 0x1021, Init: 0xFFFF)
// Browser-compatible replacement for Node.js 'crc' module
// ==========================================
function crc16ccitt(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc;
}

// ==========================================
// EMVCo / SGQR Tag Name Lookup Table
// ==========================================
const TAG_NAMES = {
    '00': 'Payload Format Indicator',
    '01': 'Point of Initiation Method',
    '02': 'Merchant Account (Visa)',
    '03': 'Merchant Account (Mastercard)',
    '04': 'Merchant Account (Mastercard)',
    '05': 'Merchant Account (JCB)',
    '06': 'Merchant Account (UnionPay)',
    '07': 'Merchant Account (AMEX)',
    '26': 'Merchant Account (PayNow)',
    '27': 'Merchant Account Info',
    '28': 'Merchant Account Info',
    '29': 'Merchant Account Info',
    '30': 'Merchant Account Info',
    '31': 'Merchant Account Info',
    '51': 'Merchant Category Code',
    '52': 'Merchant Category Code',
    '53': 'Transaction Currency',
    '54': 'Transaction Amount',
    '55': 'Tip or Convenience Fee',
    '56': 'Value of Fee (Fixed)',
    '57': 'Value of Fee (Percentage)',
    '58': 'Country Code',
    '59': 'Merchant Name',
    '60': 'Merchant City',
    '61': 'Postal Code',
    '62': 'Additional Data',
    '63': 'CRC (Checksum)',
    '64': 'Merchant Information (Language)',
};

// ==========================================
// Parse EMVCo QR string into TLV structure
// ==========================================
function parseEMVCo(qrString) {
    const tags = {};
    let index = 0;

    while (index < qrString.length) {
        if (index + 4 > qrString.length) break;

        const tag = qrString.substring(index, index + 2);
        const length = parseInt(qrString.substring(index + 2, index + 4), 10);

        if (isNaN(length)) {
            throw new Error(`Invalid length format at position ${index}`);
        }

        const value = qrString.substring(index + 4, index + 4 + length);
        tags[tag] = { length, value };

        index += 4 + length;
    }
    return tags;
}

// ==========================================
// PayNow Sub-tag Names (inside Tag 26)
// Sub-tags defined by MAS PayNow spec:
// 00 = Globally Unique Identifier (SG.PAYNOW)
// 01 = Proxy Type (0=Mobile, 2=UEN)
// 02 = Proxy Value (UEN or Mobile number)
// 03 = Editable Amount (0=fixed, 1=editable)
// 04 = Expiry Date (YYYYMMDD)
// 05 = Bill Reference / Reference Number
// 06 = Bill Reference (alternate)
// 07 = Company / Merchant name
// ==========================================
const PAYNOW_SUBTAG_NAMES = {
    '00': 'Globally Unique Identifier',
    '01': 'Proxy Type',
    '02': 'Proxy Value (UEN / Mobile)',
    '03': 'Editable Amount',
    '04': 'Expiry Date',
    '05': 'Bill Reference / Ref Number',
    '06': 'Bill Reference (alt)',
    '07': 'Company / Merchant Name',
};

// ==========================================
// Parse PayNow Sub-tags from Tag 26 value
// ==========================================
function parsePayNowSubTags(tag26Value) {
    const subTags = {};
    let index = 0;
    while (index < tag26Value.length) {
        if (index + 4 > tag26Value.length) break;
        const tag = tag26Value.substring(index, index + 2);
        const length = parseInt(tag26Value.substring(index + 2, index + 4), 10);
        if (isNaN(length)) break;
        const value = tag26Value.substring(index + 4, index + 4 + length);
        subTags[tag] = { length, value };
        index += 4 + length;
    }
    return subTags;
}

// ==========================================
// Extract PayNow Info from parsed data
// ==========================================
function extractPayNowInfo(parsedData) {
    // Find PayNow merchant tag (26-31)
    const merchantTag = parsedData['26'] || parsedData['27'] || parsedData['28'] ||
                        parsedData['29'] || parsedData['30'] || parsedData['31'];
    if (!merchantTag) return null;

    const subTags = parsePayNowSubTags(merchantTag.value);

    // Proxy type: 0=Mobile, 2=UEN (per MAS PayNow spec)
    const proxyType = subTags['01'] ? subTags['01'].value : null;
    const proxyValue = subTags['02'] ? subTags['02'].value : null;

    let uen = null;
    let mobile = null;
    if (proxyType === '2') {
        uen = proxyValue;   // UEN
    } else if (proxyType === '0') {
        mobile = proxyValue; // Mobile
    } else if (proxyValue) {
        uen = proxyValue;   // Fallback
    }

    // Editable: 0 = fixed, 1 = editable
    const editableRaw = subTags['03'] ? subTags['03'].value : null;
    let editable = null;
    if (editableRaw === '0') editable = false;
    else if (editableRaw === '1') editable = true;

    // Expiry date from sub-tag 04 (YYYYMMDD)
    const expiryRaw = subTags['04'] ? subTags['04'].value : null;
    let expiry = null;
    if (expiryRaw && expiryRaw.length === 8) {
        expiry = `${expiryRaw.substring(0, 4)}-${expiryRaw.substring(4, 6)}-${expiryRaw.substring(6, 8)}`;
    } else if (expiryRaw) {
        expiry = expiryRaw;
    }

    // Reference Number (sub-tag 05, or sub-tag 06 in some implementations)
    const refNumber = subTags['05'] ? subTags['05'].value
                    : subTags['06'] ? subTags['06'].value
                    : null;

    // Company / Merchant name from sub-tag 07, or tag 59
    const company = subTags['07'] ? subTags['07'].value
                  : parsedData['59'] ? parsedData['59'].value
                  : null;

    // Amount from tag 54
    const amount = parsedData['54'] ? parsedData['54'].value : null;

    return {
        uen,
        mobile,
        amount,
        editable,
        expiry,
        refNumber,
        company,
        proxyType,
        subTags,
    };
}

// ==========================================
// Main PayNow QR Validation Function
// ==========================================
function validatePayNowQR(qrString) {
    if (!qrString || qrString.trim().length === 0) {
        return { valid: false, reason: 'Please enter a QR data string.' };
    }

    qrString = qrString.trim();

    // 1. Verify CRC-16 Checksum (Tag 63)
    // Tag 63 (CRC) must be at the end: '6304' + 4 hex chars
    const crcTagPos = qrString.lastIndexOf('6304');
    if (crcTagPos === -1 || crcTagPos + 8 !== qrString.length) {
        return {
            valid: false,
            reason: "QR string does not contain a valid CRC checksum at the end (must end with '6304XXXX' where XXXX is a 4-character hex value)."
        };
    }

    const mainData = qrString.substring(0, qrString.length - 4); // CRC input: from start through '6304'
    const expectedCrc = qrString.substring(qrString.length - 4).toUpperCase();
    const calculatedCrc = crc16ccitt(mainData).toString(16).toUpperCase().padStart(4, '0');

    const crcValid = calculatedCrc === expectedCrc;

    try {
        // 2. Parse TLV structure
        const parsedData = parseEMVCo(qrString);

        const checks = [];

        // CRC check
        checks.push({
            name: 'CRC-16 Checksum',
            pass: crcValid,
            detail: crcValid
                ? `Checksum matched: ${expectedCrc}`
                : `In QR: ${expectedCrc}, Calculated: ${calculatedCrc}`
        });

        // 3. Validate required tags
        // Tag 00: Payload Format Indicator
        const tag00Valid = parsedData['00'] && parsedData['00'].value === '01';
        checks.push({
            name: 'Tag 00 - Payload Format',
            pass: !!tag00Valid,
            detail: tag00Valid
                ? "Value '01' is valid"
                : parsedData['00']
                    ? `Value '${parsedData['00'].value}' is invalid (expected '01')`
                    : 'Missing Tag 00'
        });

        // Tag 53: Transaction Currency
        const tag53Valid = parsedData['53'] && parsedData['53'].value === '702';
        checks.push({
            name: 'Tag 53 - Currency (SGD)',
            pass: !!tag53Valid,
            detail: tag53Valid
                ? "Value '702' (SGD) is valid"
                : parsedData['53']
                    ? `Value '${parsedData['53'].value}' is not SGD (expected '702')`
                    : 'Missing Tag 53'
        });

        // Tag 58: Country Code
        const tag58Valid = parsedData['58'] && parsedData['58'].value === 'SG';
        checks.push({
            name: 'Tag 58 - Country Code',
            pass: !!tag58Valid,
            detail: tag58Valid
                ? "Value 'SG' is valid"
                : parsedData['58']
                    ? `Value '${parsedData['58'].value}' (expected 'SG')`
                    : 'Missing Tag 58'
        });

        // Tag 26: Merchant Account Info (PayNow)
        const merchantTag = parsedData['26'] || parsedData['27'] || parsedData['28'] || parsedData['29'] || parsedData['30'] || parsedData['31'];
        checks.push({
            name: 'Merchant Account Info',
            pass: !!merchantTag,
            detail: merchantTag
                ? 'Merchant information found'
                : 'Merchant tag not found (26-31)'
        });

        const allPassed = checks.every(c => c.pass);

        return {
            valid: allPassed,
            message: allPassed
                ? 'QR string is valid and compliant with EMVCo PayNow / SGQR standards!'
                : 'QR string has some invalid fields.',
            checks,
            data: parsedData
        };

    } catch (error) {
        return { valid: false, reason: `String syntax error: ${error.message}` };
    }
}

// ==========================================
// DOM Interaction
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Elements - Tabs
    const tabUpload = document.getElementById('tab-upload');
    const tabText = document.getElementById('tab-text');
    const contentUpload = document.getElementById('content-upload');
    const contentText = document.getElementById('content-text');

    // Elements - Upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const dropZonePrompt = document.getElementById('drop-zone-prompt');
    const dropZonePreview = document.getElementById('drop-zone-preview');
    const previewImg = document.getElementById('preview-img');
    const removeImgBtn = document.getElementById('remove-img-btn');
    const decodedBadge = document.getElementById('decoded-badge');
    const decodeStatus = document.getElementById('decode-status');
    const qrCanvas = document.getElementById('qr-canvas');

    // Elements - Text
    const qrInput = document.getElementById('qr-input');
    const charCount = document.getElementById('char-count');

    // Elements - Shared
    const btnValidate = document.getElementById('btn-validate');
    const btnClear = document.getElementById('btn-clear');
    const resultSection = document.getElementById('result-section');
    const resultCard = document.getElementById('result-card');
    const resultIcon = document.getElementById('result-icon');
    const resultTitle = document.getElementById('result-title');
    const resultMessage = document.getElementById('result-message');
    const resultDetails = document.getElementById('result-details');
    const paynowInfoSection = document.getElementById('paynow-info-section');
    const tagsTbody = document.getElementById('tags-tbody');

    // State
    let activeTab = 'upload';
    let decodedQRString = ''; // QR string decoded from image

    // ==========================================
    // Tab Switching
    // ==========================================
    function switchTab(tab) {
        activeTab = tab;

        tabUpload.classList.toggle('active', tab === 'upload');
        tabText.classList.toggle('active', tab === 'text');
        contentUpload.classList.toggle('active', tab === 'upload');
        contentText.classList.toggle('active', tab === 'text');
    }

    tabUpload.addEventListener('click', () => switchTab('upload'));
    tabText.addEventListener('click', () => switchTab('text'));

    // ==========================================
    // Image Upload & Drag/Drop
    // ==========================================
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropZone.addEventListener('click', (e) => {
        // Only trigger if clicking the prompt area (not preview/remove btn)
        if (dropZonePreview.style.display === 'none' || dropZonePreview.style.display === '') {
            fileInput.click();
        }
    });

    // Drag events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleImageFile(files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleImageFile(fileInput.files[0]);
        }
    });

    // Remove image
    removeImgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearImage();
    });

    function handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgDataUrl = e.target.result;

            // Show preview
            previewImg.src = imgDataUrl;
            dropZonePrompt.style.display = 'none';
            dropZonePreview.style.display = 'flex';
            decodedBadge.style.display = 'none';

            // Decode QR from image
            decodeQRFromImage(imgDataUrl);
        };
        reader.readAsDataURL(file);
    }

    function clearImage() {
        previewImg.src = '';
        dropZonePrompt.style.display = 'block';
        dropZonePreview.style.display = 'none';
        decodedBadge.style.display = 'none';
        decodeStatus.style.display = 'none';
        decodeStatus.className = 'decode-status';
        decodedQRString = '';
        fileInput.value = '';
        resultSection.style.display = 'none';
    }

    function decodeQRFromImage(dataUrl) {
        const img = new Image();
        img.onload = () => {
            const ctx = qrCanvas.getContext('2d');

            // Use larger canvas for better detection
            const maxSize = 1024;
            let w = img.width;
            let h = img.height;

            if (w > maxSize || h > maxSize) {
                const scale = maxSize / Math.max(w, h);
                w = Math.floor(w * scale);
                h = Math.floor(h * scale);
            }

            qrCanvas.width = w;
            qrCanvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);

            const imageData = ctx.getImageData(0, 0, w, h);

            // Use jsQR to decode
            if (typeof jsQR === 'undefined') {
                showDecodeStatusText('error', 'jsQR library not loaded. Please check your internet connection.');
                return;
            }

            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });

            if (code) {
                decodedQRString = code.data;
                decodedBadge.style.display = 'inline-flex';
                showDecodeStatus('success',
                    `Successfully decoded QR data:<span class="decoded-string">${escapeHtml(decodedQRString)}</span>`
                );
            } else {
                // Try again with inversion
                const codeInverted = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'attemptBoth',
                });

                if (codeInverted) {
                    decodedQRString = codeInverted.data;
                    decodedBadge.style.display = 'inline-flex';
                    showDecodeStatus('success',
                        `Successfully decoded QR data:<span class="decoded-string">${escapeHtml(decodedQRString)}</span>`
                    );
                } else {
                    decodedQRString = '';
                    showDecodeStatusText('error', 'Could not detect a QR code in this image. Try a clearer image or paste the data string manually.');
                }
            }
        };
        img.src = dataUrl;
    }

    function showDecodeStatus(type, htmlContent) {
        decodeStatus.style.display = 'block';
        decodeStatus.className = `decode-status decode-${type}`;
        // Use textContent for safety; callers that need rich content
        // should pre-build escaped HTML via escapeHtml().
        decodeStatus.innerHTML = htmlContent;
    }

    /**
     * Safe version: shows a plain-text status message (no HTML injection risk).
     */
    function showDecodeStatusText(type, message) {
        decodeStatus.style.display = 'block';
        decodeStatus.className = `decode-status decode-${type}`;
        decodeStatus.textContent = message;
    }

    // ==========================================
    // Text Input
    // ==========================================
    qrInput.addEventListener('input', () => {
        const len = qrInput.value.trim().length;
        charCount.textContent = `${len} characters`;
    });

    // Ctrl+Enter to submit
    qrInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runValidation();
        }
    });

    // ==========================================
    // Shared Actions
    // ==========================================
    btnClear.addEventListener('click', () => {
        qrInput.value = '';
        charCount.textContent = '0 characters';
        clearImage();
        resultSection.style.display = 'none';
        if (activeTab === 'text') {
            qrInput.focus();
        }
    });

    btnValidate.addEventListener('click', () => {
        runValidation();
    });

    function getQRString() {
        if (activeTab === 'upload') {
            return decodedQRString;
        }
        return qrInput.value.trim();
    }

    function runValidation() {
        const qrString = getQRString();

        if (!qrString) {
            if (activeTab === 'upload') {
                showDecodeStatusText('error', 'Please upload a QR code image first.');
            }
        }

        const result = validatePayNowQR(qrString);

        // Reset animation
        resultSection.style.display = 'none';
        void resultSection.offsetHeight; // force reflow
        resultSection.style.display = 'block';

        resultCard.className = 'result-card';

        if (result.valid) {
            resultCard.classList.add('success');
            resultIcon.innerHTML = '✅';
            resultTitle.textContent = 'Valid!';
            resultMessage.textContent = result.message;
        } else {
            resultCard.classList.add('error');
            resultIcon.innerHTML = '❌';
            resultTitle.textContent = 'Invalid';
            resultMessage.textContent = result.reason || result.message;
        }

        // Render checks summary if available
        if (result.checks) {
            let checksHtml = '<div class="checks-list" style="margin-top:16px;">';
            result.checks.forEach(check => {
                const icon = check.pass ? '✅' : '❌';
                const color = check.pass ? 'var(--text-success)' : 'var(--text-error)';
                checksHtml += `
                    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-default);">
                        <span style="flex-shrink:0;">${icon}</span>
                        <div>
                            <span style="font-weight:600;color:${color};font-size:0.85rem;">${escapeHtml(check.name)}</span>
                            <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px;">${escapeHtml(check.detail)}</span>
                        </div>
                    </div>`;
            });
            checksHtml += '</div>';
            resultMessage.innerHTML = escapeHtml(result.message || result.reason || '') + checksHtml;
        }

        // Render PayNow Info Card
        if (result.data) {
            const payNowInfo = extractPayNowInfo(result.data);
            if (payNowInfo) {
                renderPayNowInfoCard(payNowInfo);
                paynowInfoSection.style.display = 'block';
            } else {
                paynowInfoSection.style.display = 'none';
            }
        } else {
            paynowInfoSection.style.display = 'none';
        }

        // Render TLV table if data exists
        if (result.data) {
            tagsTbody.innerHTML = '';
            const sortedTags = Object.keys(result.data).sort();

            sortedTags.forEach(tag => {
                const info = result.data[tag];
                const name = TAG_NAMES[tag] || '—';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="tag-badge">${escapeHtml(tag)}</span></td>
                    <td><span class="tag-name">${escapeHtml(name)}</span></td>
                    <td><span class="tag-length">${parseInt(info.length, 10)}</span></td>
                    <td><span class="tag-value">${escapeHtml(info.value)}</span></td>
                `;
                tagsTbody.appendChild(tr);
            });

            resultDetails.style.display = 'block';
        } else {
            resultDetails.style.display = 'none';
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================
    // Render PayNow Info Card
    // ==========================================
    function renderPayNowInfoCard(info) {
        const fields = [
            {
                icon: '🏢',
                label: 'Company / Merchant',
                value: info.company || null,
                highlight: false,
            },
            {
                icon: '🆔',
                label: 'UEN',
                value: info.uen || (info.mobile ? `Mobile: ${info.mobile}` : null),
                highlight: true,
                mono: true,
            },
            {
                icon: '💵',
                label: 'Amount (SGD)',
                value: info.amount ? `$${parseFloat(info.amount).toFixed(2)}` : null,
                highlight: true,
            },
            {
                icon: '✏️',
                label: 'Editable Amount',
                value: info.editable === null ? null
                     : info.editable ? 'Yes — buyer can change amount'
                     : 'No — amount is fixed',
                badge: info.editable === null ? null
                     : info.editable ? 'editable' : 'fixed',
            },
            {
                icon: '📅',
                label: 'Expiry Date',
                value: info.expiry || null,
                mono: true,
            },
            {
                icon: '🔖',
                label: 'Reference Number',
                value: info.refNumber || null,
                mono: true,
            },
        ];

        const validFields = fields.filter(f => f.value !== null);

        let html = '';
        validFields.forEach(f => {
            let valueHtml;
            if (f.badge === 'editable') {
                valueHtml = `<span class="pn-badge pn-badge-editable">${escapeHtml(f.value)}</span>`;
            } else if (f.badge === 'fixed') {
                valueHtml = `<span class="pn-badge pn-badge-fixed">${escapeHtml(f.value)}</span>`;
            } else if (f.mono) {
                valueHtml = `<span class="pn-value pn-mono">${escapeHtml(f.value)}</span>`;
            } else if (f.highlight) {
                valueHtml = `<span class="pn-value pn-highlight">${escapeHtml(f.value)}</span>`;
            } else {
                valueHtml = `<span class="pn-value">${escapeHtml(f.value)}</span>`;
            }

            html += `
                <div class="pn-field">
                    <span class="pn-icon">${f.icon}</span>
                    <div class="pn-field-body">
                        <span class="pn-label">${f.label}</span>
                        ${valueHtml}
                    </div>
                </div>`;
        });

        document.getElementById('paynow-info-grid').innerHTML = html;
    }

    // ==========================================
    // Auto-load QR from URL param ?qr=<url>
    // ==========================================
    (function initFromUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const qrUrl = params.get('qr');
        if (!qrUrl) return;

        // XSS Protection: Only allow safe URL protocols
        try {
            const parsed = new URL(qrUrl, window.location.origin);
            if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) return;
        } catch (e) {
            return; // Invalid URL
        }

        // Switch to upload tab so decodedQRString is used on validate
        switchTab('upload');

        showDecodeStatusText('success', 'Đang xử lý ảnh QR...');

        const logoImg = document.getElementById('logo-qr-img');

        function captureAndDecode() {
            if (typeof html2canvas === 'undefined') {
                showDecodeStatus('error', 'html2canvas library not loaded.');
                return;
            }

            // Chụp element logo-qr-img ngay trên UI
            html2canvas(logoImg, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                scale: 2, // scale cao để ảnh QR sắc nét hơn khi decode
            }).then(function (capturedCanvas) {
                const ctx = qrCanvas.getContext('2d');

                const w = capturedCanvas.width;
                const h = capturedCanvas.height;

                qrCanvas.width = w;
                qrCanvas.height = h;
                ctx.drawImage(capturedCanvas, 0, 0);

                const imageData = ctx.getImageData(0, 0, w, h);

                if (typeof jsQR === 'undefined') {
                    showDecodeStatusText('error', 'jsQR library not loaded.');
                    return;
                }

                let code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert',
                });

                if (!code) {
                    code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: 'attemptBoth',
                    });
                }

                if (code) {
                    decodedQRString = code.data;
                    decodedBadge.style.display = 'inline-flex';
                    showDecodeStatus('success',
                        `QR decoded thành công:<span class="decoded-string">${escapeHtml(decodedQRString)}</span>`
                    );
                } else {
                    showDecodeStatusText('error', 'Không thể decode QR từ ảnh. Thử paste chuỗi data thủ công.');
                }
            }).catch(function (err) {
                showDecodeStatusText('error', 'Lỗi khi chụp ảnh: ' + err.message);
            });
        }

        // Đợi ảnh hiển thị xong rồi mới chụp
        if (logoImg.complete && logoImg.naturalWidth > 0) {
            captureAndDecode();
        } else {
            logoImg.addEventListener('load', captureAndDecode, { once: true });
            logoImg.addEventListener('error', () => {
                showDecodeStatusText('error', 'Không thể tải ảnh từ URL.');
            }, { once: true });
        }
    })();
});