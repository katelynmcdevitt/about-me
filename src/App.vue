<script setup lang="ts">
const profile = {
  name: "Katelyn McDevitt",
  location: "Glen Mills, PA",
  linkedin: "https://www.linkedin.com/in/katelyn-mcdevitt",
  email: "katelyn.m.mcdevitt@gmail.com"
};
</script>

<template>
  <div class="site-shell">
    <main id="main">
      <h1>
        <em>{{ profile.name }}</em>
      </h1>
      <p class="location">Based in {{ profile.location }}</p>
      <p class="bio">
        A front end software engineer with 15+ years of experience spanning
        individual contribution, technical leadership, and
        management—bringing both an engineering and a team perspective to my
        work.
      </p>
      <!-- <ul class="expertise" aria-label="Experience">
        <li>Front end engineering</li>
        <li>Technical leadership</li>
        <li>Management</li>
      </ul> -->
      <div class="contact-actions">
        <a class="contact-link" :href="`mailto:${profile.email}`">
          Email me <span aria-hidden="true">↗</span>
        </a>
        <a
          class="contact-link"
          :href="profile.linkedin"
          target="_blank"
          rel="noopener noreferrer"
          >Connect on LinkedIn <span aria-hidden="true">↗</span></a
        >
        <a class="contact-link" href="/KatelynMcDevittResume.pdf" download>
          Download résumé <span aria-hidden="true">↓</span>
        </a>
      </div>
    </main>
    <footer>
      <span>&copy; {{ new Date().getFullYear() }} {{ profile.name }}</span>
    </footer>
  </div>
</template>

<style>
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap");
:root {
  font-family: "DM Sans", sans-serif;
  color: #e5efef;
  background: #101b24;
  color-scheme: dark;
  font-synthesis: none;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: radial-gradient(ellipse at 90% 30%, #16353480, transparent 60%);
}
a {
  color: inherit;
  text-decoration: none;
}
a:focus-visible {
  outline: 2px solid #85d6bb;
  outline-offset: 7px;
}
::selection {
  background: #326b68;
  color: #fff;
}
.site-shell {
  max-width: 1120px;
  min-height: 100svh;
  margin: auto;
  padding: 0 56px;
  display: flex;
  flex-direction: column;
}
main {
  padding: 64px 0 70px;
  flex: 1;
}
h1 {
  font-family: "Manrope", sans-serif;
  font-size: clamp(42px, 6.2vw, 72px);
  line-height: 1.15;
  letter-spacing: -3px;
  font-weight: 500;
  margin: 26px 0 30px;
}
h1 em {
  font-family: Georgia, serif;
  font-weight: 400;
  color: #85d6bb;
}
p {
  max-width: 620px;
  line-height: 1.8;
  margin: 0;
}
.location {
  color: #85b6c4;
  font-size: 13px;
  margin-bottom: 20px;
}
.bio {
  font-size: 15px;
  color: #9fb5be;
  margin-top: 12px;
}
.expertise {
  list-style: none;
  padding: 0;
  margin: 25px 0 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.expertise li {
  border: 1px solid #34505b;
  background: #192d36;
  border-radius: 30px;
  padding: 8px 13px;
  font-size: 11px;
  color: #b8d4dc;
}
.contact-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 15px
}
.contact-link {
  display: inline-flex;
  align-items: center;
  gap: 28px;
  padding: 14px 20px;
  border-radius: 6px;
  background: #85d6bb;
  color: #102c27;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s ease;
}
.contact-link:hover {
  background: #a4e6d0;
}
footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 25px 0;
  border-top: 1px solid #2a3b46;
  color: #8faab2;
  font-size: 11px;
}
@media (max-width: 640px) {
  .site-shell {
    padding: 0 24px;
  }
  main {
    padding: 48px 0 56px;
  }
  h1 {
    letter-spacing: -2px;
  }
  .bio {
    font-size: 14px;
  }
  footer {
    font-size: 10px;
    flex-wrap: wrap;
  }
}
@media (prefers-reduced-motion: reduce) {
  .contact-link {
    transition: none;
  }
}
</style>
