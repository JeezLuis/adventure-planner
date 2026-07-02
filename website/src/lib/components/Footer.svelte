<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import LanguageSelect from '$lib/components/LanguageSelect.svelte';
    import ModeSwitch from '$lib/components/ModeSwitch.svelte';
    import Logo from '$lib/components/Logo.svelte';
    import { APP_NAME, REPOSITORY_URL, UPSTREAM_NAME, UPSTREAM_URL } from '$lib/brand';
</script>

<!--
    Minimal site footer: product identity, the MIT/upstream attribution we are
    required (and glad) to keep, and the language/theme switches. Shown only on
    non-app pages (see routes/+layout.svelte).
-->
<footer class="w-full px-12 py-10 border-t flex flex-col items-center">
    <div class="w-full max-w-5xl flex flex-row flex-wrap justify-between items-start gap-x-10 gap-y-6">
        <div class="grow flex flex-col items-start">
            <Logo class="h-8" width="153" />
            <span class="text-sm text-muted-foreground mt-1">
                {APP_NAME} is based on
                <a href={UPSTREAM_URL} target="_blank" class="hover:underline">{UPSTREAM_NAME}</a>
                (MIT license).
            </span>
            <div class="mt-3 flex flex-row gap-1.5">
                <LanguageSelect />
                <ModeSwitch />
            </div>
        </div>
        <div class="flex flex-col items-start gap-1">
            <Button
                variant="link"
                class="h-6 px-0 has-[>svg]:px-0 text-muted-foreground"
                href={REPOSITORY_URL}
                target="_blank"
            >
                <Logo company="github" class="h-4 fill-muted-foreground" />
                Source code
            </Button>
        </div>
    </div>
</footer>
