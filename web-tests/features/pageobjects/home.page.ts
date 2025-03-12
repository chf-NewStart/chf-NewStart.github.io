import { ChainablePromiseElement } from 'webdriverio';

class HomePage {
    // Selectors
    get navLinks() { return $$('.nav-links a'); }
    get aboutSection() { return $('#about-section'); }
    get skillsSection() { return $('#skills-section'); }
    get experienceSection() { return $('#experience-section'); }
    get projectsSection() { return $('#projects-section'); }
    
    // Methods
    async open() {
        await browser.url('https://houfu72.com/');
    }
    
    async clickNavLink(linkText: string) {
        const link = await $(`//nav//a[contains(text(), "${linkText}")]`);
        await link.click();
        await browser.pause(500); // Add small pause for smooth scrolling
    }
    
    async isSectionVisible(sectionTitle: string) {
        const section = await $(`//h2[contains(text(), "${sectionTitle}")]`);
        await section.waitForDisplayed();
        return section.isDisplayed(); // Changed from isDisplayedInViewport
    }
    async openProject(projectName: string) {
        const projectBtn = await $(`.project-btn*=${projectName}`);
        await projectBtn.click();
        await browser.pause(300); // Wait for animation
    }
    
    async isProjectDetailVisible(projectTitle: string) {
        const projectDetail = await $(`//h3[contains(text(), "${projectTitle}")]`);
        return projectDetail.isDisplayed();
    }
}

export default new HomePage();