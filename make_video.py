import os
import time
import random
from moviepy.editor import *

# Настройки видео
WIDTH, HEIGHT = 1080, 1920
FPS = 30
DURATION = 20  # длина видео в секундах

# Цвета
BG_COLOR = (10, 10, 15)  # темно-синий/черный
TEXT_COLOR = (255, 255, 255)
ACCENT_COLOR = (255, 200, 0)  # золотой

def create_robot_frame(t):
    # Создаем кадр с роботом (вместо картинки)
    # Это просто геометрическая отрисовка, чтобы не искать PNG
    import numpy as np
    img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    
    # Рисуем фон
    img[:, :] = BG_COLOR
    
    # Рисуем голову робота (прямоугольник со скруглениями)
    # Для простоты используем прямоугольник
    y1, y2 = int(HEIGHT * 0.6), int(HEIGHT * 0.8)
    x1, x2 = int(WIDTH * 0.3), int(WIDTH * 0.7)
    img[y1:y2, x1:x2] = (40, 40, 50)  # темно-серый
    
    # Глаза (желтые круги)
    eye_radius = 40
    eye_y = int(HEIGHT * 0.68)
    eye_x1, eye_x2 = int(WIDTH * 0.4), int(WIDTH * 0.6)
    
    # Логика моргания: раз в 6 секунд
    if int(t) % 6 == 0 and (t % 1) < 0.2:
        # Глаза закрыты (рисуем линии)
        cv2.line(img, (eye_x1 - 30, eye_y), (eye_x1 + 30, eye_y), ACCENT_COLOR, 5)
        cv2.line(img, (eye_x2 - 30, eye_y), (eye_x2 + 30, eye_y), ACCENT_COLOR, 5)
    else:
        # Глаза открыты
        cv2.circle(img, (eye_x1, eye_y), eye_radius, ACCENT_COLOR, -1)
        cv2.circle(img, (eye_x2, eye_y), eye_radius, ACCENT_COLOR, -1)
        # Зрачки
        cv2.circle(img, (eye_x1, eye_y), 10, (0, 0, 0), -1)
        cv2.circle(img, (eye_x2, eye_y), 10, (0, 0, 0), -1)

    # Рот (открывается в такт)
    # Простая симуляция: открыт на четных секундах
    if int(t) % 2 == 0:
        # Рот открыт
        cv2.ellipse(img, (WIDTH // 2, int(HEIGHT * 0.76)), (60, 30), 0, 0, 180, ACCENT_COLOR, -1)
    else:
        # Рот закрыт
        cv2.line(img, (WIDTH // 2 - 60, int(HEIGHT * 0.76)), (WIDTH // 2 + 60, int(HEIGHT * 0.76)), ACCENT_COLOR, 5)

    return img

def create_text_frame(t):
    # Здесь можно накладывать текст (заголовок, цены и т.д.)
    # Для теста создадим простой фон и текст
    import numpy as np
    img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    img[:, :] = BG_COLOR
    # В будущем сюда добавим текст
    return img

# Генерация видео
def make_video():
    print("Начинаю генерацию видео...")
    
    # Длительность
    duration = 20
    
    # Фоновый клип
    def make_frame(t):
        return create_robot_frame(t)

    # Создаем клип
    clip = VideoClip(make_frame, duration=duration)
    
    # Сохраняем
    clip.write_videofile("output.mp4", fps=FPS, codec='libx264', audio=False)
    
    print("Видео готово: output.mp4")

if __name__ == "__main__":
    make_video()
