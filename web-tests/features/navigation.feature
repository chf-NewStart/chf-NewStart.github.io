Feature: Portfolio Navigation

  Background:
    Given I am on the portfolio website

  Scenario: User can navigate through all main sections
    When I click on the "About" link
    Then I should see the "Who I Am" section
    When I click on the "Skills" link
    Then I should see the "What I Know" section
    When I click on the "Experience" link
    Then I should see the "Where I've Been" section
    When I click on the "Projects" link
    Then I should see the "What I've Built" section