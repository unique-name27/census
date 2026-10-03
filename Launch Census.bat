@echo off
rem Opens Census in an app-style window (Edge or Chrome). No install, server or internet needed.
rem Keep this file next to census.html.
setlocal
set "HTML=%~dp0census.html"
set "URL=%HTML:\=/%"
if not exist "%HTML%" (
  echo Could not find census.html next to this launcher.
  echo Build it with: npm run build:single
  pause
  exit /b 1
)
start msedge --app="file:///%URL%" 2>nul && goto :eof
start chrome --app="file:///%URL%" 2>nul && goto :eof
start "" "%HTML%"
