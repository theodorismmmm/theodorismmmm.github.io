// ==========================================
// 1. CONFIGURATION & CREDENTIALS
// ==========================================
const SUPABASE_URL = 'https://ujlhyugejsgqdtjfejar.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbGh5dWdlanNncWR0amZlamFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTU0NDksImV4cCI6MjA5MTM5MTQ0OX0.IpFfh8RliulIFoU1SiYpf20mQ2XLnFV8HKixaaqoitE';

// Discord Webhook wrapped in a CORS proxy to prevent browser blocking
const RAW_WEBHOOK = 'https://discord.com/api/webhooks/1499684331633905667/o85983SOfWdkvE6qvC4-P7Z3t1rV65KRaTl7EWiCnq5USEpQOYuvu-vut38tEZiY-abi';
const DISCORD_WEBHOOK = 'https://corsproxy.io/?' + encodeURIComponent(RAW_WEBHOOK);

// Global Variables
let supabase;
let validatedOrder = null;
let generatedOrderIdForCopy = "";

// ==========================================
// 2. INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Ensure the Supabase library loaded from the CDN
    if (!window.supabase) {
        alert("Critical Error: Supabase failed to load. Check internet or disable adblocker.");
        return;
    }
    
    // Initialize Supabase Client
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Set initial UI state
    renderPlan();
});

// ==========================================
// 3. PRICING SLIDER LOGIC
// ==========================================
const PLANS = [
    { id: "30", label: "30 days", price: 2.00 },
    { id: "60", label: "60 days", price: 3.00 },
    { id: "permanent", label: "Lifetime", price: 4.00 }
];

const slider = document.getElementById("duration-slider");
const durationDisplay = document.getElementById("duration-display");
const priceDisplay = document.getElementById("price-display");

function renderPlan() {
    const plan = PLANS[Number(slider.value)] || PLANS[0];
    durationDisplay.textContent = plan.label;
    priceDisplay.textContent = plan.price.toFixed(2) + "€";
}

slider.addEventListener("input", renderPlan);

// ==========================================
// 4. CHECKOUT LOGIC
// ==========================================
document.getElementById("checkout-btn").addEventListener("click", async () => {
    try {
        const plan = PLANS[Number(slider.value)];
        const orderId = 'ORD-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const priceString = plan.price.toFixed(2);

        // A. Setup UI (Hide store, show order ID)
        document.getElementById('store-section').classList.add('hidden');
        document.getElementById('order-generated-section').classList.remove('hidden');
        document.getElementById('display-order-id').innerText = orderId;
        document.getElementById('order-id').value = orderId; // Auto-fill the tracker
        generatedOrderIdForCopy = orderId;

        // B. Save Order to Database
        const { error } = await supabase.from('orders').insert([
            { order_id: orderId, days: plan.id, status: 'pending' }
        ]);
        
        if (error) {
            throw new Error("Database Write Error: " + error.message);
        }

        // C. Send Discord Webhook
        // Note: We catch errors silently here so that if the webhook fails, PayPal still opens
        fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                content: `🛒 **New Purchase Attempt**\n**Order ID:** \`${orderId}\`\n**Duration:** ${plan.label}\n**Expected:** €${priceString}` 
            })
        }).catch(err => console.log("Webhook failed, order saved locally."));

        // D. Open PayPal in a new tab
        window.open(`https://paypal.me/transfer959/${priceString}`, '_blank');
        
    } catch (err) {
        alert("Checkout Error: " + err.message);
    }
});

// Helper Function: Copy ID Button
document.getElementById("copy-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(generatedOrderIdForCopy);
    alert("Copied: " + generatedOrderIdForCopy);
});

// ==========================================
// 5. ORDER STATUS CHECKER
// ==========================================
function showStatus(text, colorHex) {
    const msgBox = document.getElementById('status-message');
    msgBox.style.color = colorHex;
    msgBox.style.border = `1px solid ${colorHex}`;
    msgBox.innerText = text;
    msgBox.classList.remove('hidden');
}

document.getElementById("check-status-btn").addEventListener("click", async () => {
    try {
        const orderId = document.getElementById('order-id').value.trim().toUpperCase();
        
        if (!orderId) {
            return showStatus("Please enter an Order ID.", "#ff3333");
        }

        showStatus("Checking database...", "#fbbf24");

        // Query Supabase for the order
        const { data, error } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
        const licSection = document.getElementById('license-section');

        // Handle Results
        if (error || !data) {
            showStatus("Order not found. Check your ID.", "#ff3333");
            licSection.classList.add('hidden');
            return;
        }

        if (data.status === 'authorized') {
            showStatus("Payment Verified! Claim your key below.", "#4ade80");
            validatedOrder = data; // Save the validated data for the next step
            licSection.classList.remove('hidden');
        } else if (data.status === 'claimed') {
            showStatus("This order was already used to claim a key.", "#ff3333");
            licSection.classList.add('hidden');
        } else {
            showStatus("Payment pending verification. Please wait.", "#fbbf24");
            licSection.classList.add('hidden');
        }
    } catch (err) {
        alert("Status Check Error: " + err.message);
    }
});

// ==========================================
// 6. LICENSE GENERATION
// ==========================================
document.getElementById("create-license-btn").addEventListener("click", async () => {
    try {
        if (!validatedOrder) return;
        
        let inputKey = document.getElementById('custom-key').value.trim().replace(/\s+/g, '-').toUpperCase();
        
        // Generate a random key if the user left it blank
        let finalKey = inputKey || 'KAHACK-' + Math.random().toString(36).substr(2, 8).toUpperCase();

        // A. Insert License into Supabase
        const { error } = await supabase.from('licenses').insert([{
            key: finalKey, 
            rank: validatedOrder.days 
        }]);

        if (error) {
            showStatus("Custom key already taken! Try another.", "#ff3333");
            return;
        } 
        
        // B. Lock the Order (Prevent multiple keys from one payment)
        await supabase.from('orders').update({ status: 'claimed' }).eq('order_id', validatedOrder.order_id);
        
        // C. Show Success UI
        document.getElementById('license-section').innerHTML = `
            <div style="text-align:center;">
                <h2 class="text-success" style="margin-bottom:10px;">SUCCESS!</h2>
                <div class="order-box" style="margin:15px 0;">
                    <div style="color:#fff; font-size:16px; font-weight:bold; letter-spacing:1px;">${finalKey}</div>
                </div>
                <p style="font-size:10px; color:var(--warning);">COPY THIS KEY NOW. IT WILL NOT BE SHOWN AGAIN.</p>
            </div>
        `;
        showStatus("License generated securely.", "#4ade80");
        
    } catch (err) {
        alert("License Generation Error: " + err.message);
    }
});
