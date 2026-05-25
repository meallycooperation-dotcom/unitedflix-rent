// Authentication utility functions
import supabase from './supabase.js';

export async function checkAuthStatus() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

export async function redirectIfNotAuthenticated() {
    const session = await checkAuthStatus();
    if (!session) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

export async function logoutUser() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
}
window.logoutUser = logoutUser;

// Add profile link to the sidebar/header if user is authenticated
document.addEventListener('DOMContentLoaded', async function() {
    const session = await checkAuthStatus();
    
    const isMainPage = window.location.pathname.includes('index.html') || window.location.pathname.includes('home.html') || window.location.pathname.endsWith('/');
    if (session && isMainPage) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', session.user.id)
            .single();
        
        if (profile) {
            addProfileLink(profile, session.user);
        }
    }
});

function addProfileLink(profile, authUser) {
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebar) {
        // Create user profile section at the bottom of sidebar
        const profileSection = document.createElement('div');
        profileSection.style.cssText = `
            margin-top: auto;
            padding-top: 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
        `;

        profileSection.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="color: #cbd5e1; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Signed in as</div>
                <div style="color: #ffffff; font-weight: 700; font-size: 0.95rem; word-break: break-word;">${escapeHtml(profile.name)}</div>
            </div>
            <div style="display: flex; gap: 10px; flex-direction: column;">
                <a href="profile.html" style="padding: 10px 14px; background: rgba(255, 255, 255, 0.08); color: #ffffff; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 0.9rem; text-align: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255, 255, 255, 0.12)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.08)'">View Profile</a>
                <button onclick="handleQuickLogout()" style="padding: 10px 14px; background: rgba(220, 38, 38, 0.15); color: #fca5a5; border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 12px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.backgroundColor='rgba(220, 38, 38, 0.25)'" onmouseout="this.style.backgroundColor='rgba(220, 38, 38, 0.15)'">Sign Out</button>
            </div>
        `;

        sidebar.appendChild(profileSection);
    }
}

export async function handleQuickLogout() {
    if (confirm('Are you sure you want to sign out?')) {
        await logoutUser();
    }
}
window.handleQuickLogout = handleQuickLogout;

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
