(() => {
    // Change this value in code when you want to use another OpenAI chat model.
    window.LHU_OPENAI_MODEL = "gpt-4o-mini";

    const SUPABASE_URL = "https://josxhrsnoweqnsrzseqh.supabase.co";
    // Safe to expose in a browser. Replace this with the project's publishable/anon key.
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PCIApk1-08R9_5fQoopc4g_rilI74Ps";

    const isConfigured =
        SUPABASE_PUBLISHABLE_KEY &&
        !SUPABASE_PUBLISHABLE_KEY.startsWith("PASTE_");

    if (!window.supabase?.createClient) {
        throw new Error("Supabase JS was not loaded.");
    }

    window.lhuSupabaseConfigured = isConfigured;
    window.lhuSupabase = isConfigured
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        })
        : null;

    window.lhuRequireAuth = async () => {
        if (!window.lhuSupabase) {
            throw new Error("Chưa cấu hình Supabase publishable key trong script.js.");
        }

        const { data, error } = await window.lhuSupabase.auth.getUser();
        if (error || !data.user) {
            await window.lhuSupabase.auth.signOut({ scope: "local" });
            window.location.replace("index.html");
            return null;
        }
        return data.user;
    };
})();
