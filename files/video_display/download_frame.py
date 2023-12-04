from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

execute_flag = True
end_flag = False
# # Initialize the Chrome WebDriver with the headless option
# chrome_options = Options()
# chrome_options.add_argument("--headless")  
# driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)


def click_button_repeatedly():
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    # driver.get('http://192.168.43.118/')
    # element = driver.find_element(By.ID, 'save-still')
    driver.get('file:///D:/LYM/Toronto/2023Fall/ECE1724F1(Wearable_AI)/Project-Website/video_display/test_page.html')
    element = driver.find_element(By.ID, 'button1')
    element.click()
    wait = WebDriverWait(driver, 0.1)
    element2 = wait.until(EC.visibility_of_element_located((By.ID, 'button2')))
    start = time.time()
    detal = 120
    global execute_flag
    try:
        while (time.time()-start)<=detal and execute_flag:   
            element2.click() 
    except Exception as e:
        print(f"Error occurred: {e}")
    finally:
        global end_flag
        end_flag = True
        driver.quit()


# click_button_repeatedly()

# def stop_download():
#     global execute_flag
#     execute_flag = False








