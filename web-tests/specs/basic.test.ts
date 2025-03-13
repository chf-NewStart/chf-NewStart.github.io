import HomePage from '../features/pageobjects/home.page';

describe('Portfolio Website Tests', () => {
    beforeAll(async () => {
        await browser.url('https://houfu72.com');
    });

    it('should have the correct title', async () => {
        const title = await browser.getTitle();
        expect(title).toContain('HC-Webpage');
    });

    it('should navigate to the About section', async () => {
        const aboutLink = await $('.nav-links a[href="#about-section"]');
        await aboutLink.click();
        
        const aboutSection = await $('#about-section');
        await aboutSection.waitForDisplayed();
        
        const isVisible = await aboutSection.isDisplayedInViewport();
        expect(isVisible).toBe(true);
    });

    it('should display the Emotion Detection project card', async () => {
        // Navigate to projects section first
        const projectsLink = await $('.nav-links a[href="#projects-section"]');
        await projectsLink.click();
        
        const projectCard = await $('div.project-title*=Emotion Detection');
        await projectCard.waitForDisplayed();
        
        const isVisible = await projectCard.isDisplayed();
        expect(isVisible).toBe(true);
    });
});