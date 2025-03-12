// import { Given, When, Then } from '@wdio/cucumber-framework';
// import { expect, $ } from '@wdio/globals'

// import LoginPage from '../pageobjects/login.page';
// import SecurePage from '../pageobjects/secure.page';

// const pages = {
//     login: LoginPage
// }

// Given(/^I am on the (\w+) page$/, async (page) => {
//     await pages[page].open()
// });

// When(/^I login with (\w+) and (.+)$/, async (username, password) => {
//     await LoginPage.login(username, password)
// });

// Then(/^I should see a flash message saying (.*)$/, async (message) => {
//     await expect(SecurePage.flashAlert).toBeExisting();
//     await expect(SecurePage.flashAlert).toHaveText(expect.stringContaining(message));
// });


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