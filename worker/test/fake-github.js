// A fake GitHub for the Worker's tests (runs in Node, outside the Worker).
// The test files share this fake, so each person is used by one test file.
// Sign-in code "jacob" is the site's owner, who can push to the repo; "friend"
// can sign in but not push; "expired" gets a token GitHub no longer accepts;
// "stale" gets one that's turned down once it has run out, and a refresh
// token GitHub refuses (as when it has already been used once).
const PEOPLE = {
  jacob: { id: 1, login: "JDenn0514", name: "Jacob Dennen", push: true },
  friend: { id: 2, login: "a-friend", name: "A Friend", push: false },
  expired: { id: 3, login: "lapsed", name: "Lapsed User", push: true, rejected: true },
  renew: { id: 5, login: "renew", name: "Renew User", push: true },
  stale: { id: 4, login: "stale", name: "Stale User", push: true, refuseRefresh: true },
};
// Tokens GitHub has stopped accepting (run out, or replaced by a refresh).
const deadTokens = new Set();
const byToken = (request) => {
  const token = /^(?:Bearer|token) ghu_(\w+)$/.exec(request.headers.get("Authorization") || "")?.[1];
  return token && { ...PEOPLE[token], token, rejected: PEOPLE[token]?.rejected || deadTokens.has(`ghu_${token}`) };
};
const json = (body, status = 200) => Response.json(body, { status });

export async function fakeGitHub(request) {
  const url = new URL(request.url);
  const at = `${request.method} ${url.origin}${url.pathname}`;

  // For the tests: GitHub stops accepting someone's token, as when it runs out.
  if (at === "POST https://fake-github.test/expire") {
    deadTokens.add(`ghu_${url.searchParams.get("who")}`);
    return new Response(null, { status: 204 });
  }

  if (at === "POST https://github.com/login/oauth/access_token") {
    const form = new URLSearchParams(await request.text());
    if (form.get("grant_type") === "refresh_token") {
      const name = /^ghr_(\w+)$/.exec(form.get("refresh_token"))?.[1];
      // GitHub answers a bad refresh with 200 and an error.
      if (!PEOPLE[name] || PEOPLE[name].refuseRefresh) return json({ error: "bad_refresh_token" });
      deadTokens.delete(`ghu_${name}`);
      return json({
        access_token: `ghu_${name}`, expires_in: 28800,
        refresh_token: `ghr_${name}`, refresh_token_expires_in: 15897600,
        token_type: "bearer", scope: "",
      });
    }
    const code = form.get("code");
    if (!PEOPLE[code]) return json({ error: "bad_verification_code" });
    deadTokens.delete(`ghu_${code}`);
    return json({
      access_token: `ghu_${code}`, expires_in: 28800,
      refresh_token: `ghr_${code}`, refresh_token_expires_in: 15897600,
      token_type: "bearer", scope: "",
    });
  }

  const who = byToken(request);
  if (url.origin === "https://api.github.com" && (!who || who.rejected) && url.pathname !== "/user" && url.pathname !== "/user/emails") {
    return json({ message: "Bad credentials" }, 401);
  }
  if (at === "GET https://api.github.com/user") {
    return who ? json({ id: who.id, login: who.login, name: who.name, email: null, avatar_url: `https://avatars.example/${who.id}` }) : json({ message: "Bad credentials" }, 401);
  }
  if (at === "GET https://api.github.com/user/emails") {
    return who ? json([{ email: `${who.login}@example.com`, primary: true, verified: true }]) : json({ message: "Bad credentials" }, 401);
  }
  if (at === "GET https://api.github.com/repos/JDenn0514/shaken-stirred-sauteed") {
    return json({ full_name: "JDenn0514/shaken-stirred-sauteed", permissions: { admin: who.push, push: who.push, pull: true } });
  }
  return new Response(`The fake GitHub doesn't know ${at}`, { status: 599 });
}
