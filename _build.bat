@echo off
set MSBUILD="C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe"
echo === Building FactoryService ===
%MSBUILD% "d:\Projects\FactoryMonitoring\FactoryService\FactoryService.sln" /p:Configuration=Debug /p:Platform=x64 /t:Build /v:minimal /nologo
echo EXIT_CODE_SERVICE=%ERRORLEVEL%
echo.
echo === Building FactoryAgent ===
%MSBUILD% "d:\Projects\FactoryMonitoring\FactoryAgent\FactoryAgent.sln" /p:Configuration=Debug /p:Platform=x64 /t:Build /v:minimal /nologo
echo EXIT_CODE_AGENT=%ERRORLEVEL%
