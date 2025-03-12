import { Given, When, Then } from '@cucumber/cucumber';
import HomePage from '../pageobjects/home.page';

Given("I am on the portfolio website", async () => {
    await HomePage.open();
});

When("I click on the {string} link", async (linkText) => {
    await HomePage.clickNavLink(linkText);
});

Then("I should see the {string} section", async (sectionTitle) => {
    const isVisible = await HomePage.isSectionVisible(sectionTitle);
    expect(isVisible).toBe(true);
});
Then("the {string} section should look correct", async (sectionName) => {
    let selector: string;
    
    switch(sectionName) {
        case "About":
            selector = '#about-section';
            break;
        case "Projects":
            selector = '#projects-section';
            break;
        default:
            selector = 'body';
    }

    
    // Take screenshot and compare with baseline
    await expect($(selector)).toMatchSnapshot();
});

Then("the emo section should be clicked", async () => {
    await HomePage.clickEmotionDetectionProject();
});

Then("the emo section should be displayed", async () => {
    const isEmoDisplayed = await HomePage.isEmotionDetectionProjectDisplayed();
    expect(isEmoDisplayed).toBe(true);
});


