/**
 * The platform operator portal, reached at #admin.
 *
 * FinPilot has exactly ONE super admin. There is no operator directory and no
 * way to mint another operator from the UI — that flag is set out of band, by
 * `pnpm admin:grant`. The portal therefore has no second sign-in form and no
 * section switcher: the admin signs in once through the normal login, which
 * sends a superAdmin straight here, and lands directly on the console.
 *
 * The guard is server-side either way (requireSuperAdmin on every /admin
 * route). Anyone who reaches #admin without that flag is bounced to the
 * customer login rather than shown an operator-flavoured door to rattle.
 */
import { useEffect, useState } from 'react';
import { api, clearStoredSession, setAccessToken } from '../../lib/api';
import { Btn, C } from '../../lib/ui';
import { AdminPage } from './AdminPage';

interface Me {
  id: string;
  email: string;
  name: string;
  operator: boolean;
}

export function AdminPortal() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  // An admin arriving with a live session should not be asked to sign in again
  // just because they opened the portal in a new tab. If there is no session,
  // or the account is not the super admin, there is nothing to show here — go
  // to the single login page instead of rendering a second one.
  useEffect(() => {
    let active = true;
    api<{ accessToken: string }>('POST', '/api/v1/auth/refresh', undefined, { silent: [401] })
      .then(async (auth) => {
        if (!active) return;
        setAccessToken(auth.accessToken);
        const who = await api<Me>('GET', '/api/v1/admin/me', undefined, { silent: [401, 403] });
        if (!active) return;
        if (who.operator) setMe(who);
        else window.location.hash = '#login';
      })
      .catch(() => {
        if (active) window.location.hash = '#login';
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await api('POST', '/api/v1/auth/logout', {}, { silent: true }).catch(() => undefined);
    clearStoredSession();
    setMe(null);
    // Reload rather than just switching the hash: the customer shell keeps its
    // own in-memory user, and without a reload it re-paints the operator banner
    // and the company chooser for an account that is no longer signed in.
    window.location.hash = '#login';
    window.location.reload();
  }

  if (checking) {
    return (
      <div style={{ padding: 40, color: C.muted, background: C.bg, minHeight: '100vh' }}>
        Checking admin session…
      </div>
    );
  }
  // The effect has already redirected; render nothing rather than flashing a UI.
  if (!me) return null;

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            // The console caps its content at 1400px but the header was
            // full-bleed, so the logo and the sign-out button floated outside
            // the columns they head. Same cap and padding lines them up with
            // the nav rail and the cards.
            maxWidth: 1400,
            margin: '0 auto',
            padding: '0.85rem 1.4rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: C.accent,
                color: C.accentText,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '0.85rem',
              }}
            >
              FP
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '0.95rem' }}>
                FinPilot <span style={{ color: C.accent }}>operations</span>
              </div>
              <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                Platform-wide · no company context
              </div>
            </div>
          </div>

          {/* The email is the account you are acting as, so it reads as an
              identity chip rather than loose text beside a button. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0.3rem 0.5rem 0.3rem 0.3rem',
                borderRadius: 999,
                border: `1px solid ${C.border}`,
                background: C.panel,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: C.accentSoft,
                  color: C.accent,
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                }}
              >
                {me.email.slice(0, 1)}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ color: C.text, fontSize: '0.78rem', fontWeight: 600 }}>
                  {me.email}
                </div>
                <div style={{ color: C.muted, fontSize: '0.66rem' }}>Super admin</div>
              </div>
            </div>
            <Btn small kind="ghost" onClick={() => void signOut()}>
              Sign out
            </Btn>
          </div>
        </header>
      </div>

      <main style={{ padding: '1.2rem 1.4rem', maxWidth: 1400, margin: '0 auto' }}>
        <AdminPage
          onImpersonated={() => {
            // Impersonation hands back a token for someone else entirely, so
            // the right place to land is the customer app, not here.
            window.location.hash = 'dashboard';
            window.location.reload();
          }}
        />
      </main>
    </div>
  );
}
