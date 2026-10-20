<script setup lang="ts">
import { ref } from 'vue'
// Personal details and contact links.
const profile = { name: 'Katelyn McDevitt', email: '', linkedin: 'https://www.linkedin.com/in/katelyn-mcdevitt', introduction: 'Front end software engineer with 15+ years of experience as an individual contributor, technical lead, and manager.' }
const active = ref('All')
const filters = ['All', 'Digital', 'Explorations']
const projects = [
  { number: '01', title: 'A space for your next idea', category: 'Digital', description: 'Introduce a project you’re proud of: the idea, your part, and what you learned.', style: 'blue', label: 'YOUR NEXT CHAPTER', shape: 'orb' },
  { number: '02', title: 'Something worth exploring', category: 'Explorations', description: 'A small experiment, a side project, or a question you couldn’t leave alone.', style: 'green', label: 'STAY CURIOUS', shape: 'flower' }
]
const copied = ref(false)
async function copyEmail() {
  if (!profile.email) return
  try { await navigator.clipboard.writeText(profile.email); copied.value = true; setTimeout(() => copied.value = false, 2000) } catch { window.location.href = `mailto:${profile.email}` }
}
</script>

<template>
  <div class="site-shell">
    <header><a class="wordmark" href="#" aria-label="Home">{{ profile.name }}</a><nav aria-label="Main navigation"><a href="#about">About</a><a href="#work">Selected work</a><a class="nav-contact" href="#contact">Let’s talk <span>↗</span></a></nav></header>
    <main>
      <section class="hero" aria-labelledby="intro-title">
        <div class="hero-copy"><div class="eyebrow"><span class="dot"></span> A LITTLE INTRODUCTION</div><h1 id="intro-title">Building interfaces.<br>Leading teams.<br><em>Making an impact.</em></h1><p>{{ profile.introduction }}</p><a class="text-link" href="#about">Get to know me <span>↓</span></a></div>
        <div class="portrait-composition" role="img" aria-label="An abstract paper collage with a sun, rolling hills, and a handwritten hello"><div class="paper"><div class="paper-top">A WORK IN PROGRESS <span>↗</span></div><div class="sun"></div><div class="hill back"></div><div class="hill front"></div><div class="paper-bottom">A little perspective changes everything.</div></div><div class="hello">hello, world!</div><div class="star">✳</div><div class="caption">A little corner of the internet, made my own.</div></div>
      </section>
      <section id="about" class="about section"><div class="section-label">01 / THE PERSON</div><div><h2>More than a <em>short bio.</em></h2><p class="large-copy">I’m Katelyn, a front end software engineer with more than 15 years of experience.</p><p class="muted">My experience spans individual contribution, technical leadership, and management—bringing both an engineering and a team perspective to my work.</p><div class="interests"><span>✧ Front end engineering</span><span>↗ Technical leadership</span><span>☀ Management</span></div></div></section>
      <section id="work" class="work section"><div class="work-heading"><div><div class="section-label">02 / SELECTED WORK</div><h2>A few things <em>I’ve made.</em></h2></div><div class="filters" aria-label="Filter projects"><button v-for="filter in filters" :key="filter" :class="{ selected: active === filter }" :aria-pressed="active === filter" @click="active = filter">{{ filter }}</button></div></div><div class="projects"><article v-for="project in projects.filter(p => active === 'All' || p.category === active)" :key="project.number"><div class="project-art" :class="project.style"><span class="project-number">{{ project.number }} / PROJECT PLACEHOLDER</span><div :class="project.shape"></div><strong>{{ project.label }}</strong><span class="art-note">Ideas taking shape.</span></div><div class="project-title"><h3>{{ project.title }}</h3><span>↗</span></div><p>{{ project.description }}</p><span class="tag">{{ project.category }}</span></article></div></section>
      <section class="now section"><div class="section-label">03 / IN THE MARGINS</div><div><h2>Life outside <em>the screen.</em></h2><p class="muted">A place for the things you’re reading, learning, making, or simply enjoying lately.</p><div class="notes"><div><span>01</span><h3>Currently learning</h3><p>Add something you’re curious about.</p></div><div><span>02</span><h3>On the nightstand</h3><p>Share a book that stayed with you.</p></div><div><span>03</span><h3>Finding joy in</h3><p>The small things count, too.</p></div></div></div></section>
      <section id="contact" class="contact"><div class="eyebrow">GOOD THINGS START WITH A CONVERSATION</div><h2>Have something in mind?<br><em>Let’s say hello.</em> <span>↗</span></h2><div v-if="profile.email" class="contact-actions"><a :href="`mailto:${profile.email}`">{{ profile.email }} ↗</a><button @click="copyEmail">{{ copied ? 'Copied!' : 'Copy email' }}</button></div><div v-else class="contact-actions"><a class="text-link" :href="profile.linkedin" target="_blank" rel="noopener noreferrer">Connect on LinkedIn <span>↗</span></a></div></section>
    </main><footer><a class="wordmark" href="#">{{ profile.name }}<span>✳</span></a><span>A personal space, always evolving.</span><a href="#">Back to top ↑</a></footer>
  </div>
</template>
