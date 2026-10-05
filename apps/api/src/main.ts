import 'reflect-metadata';
import {Controller,Get,Module}from '@nestjs/common';
import {NestFactory}from '@nestjs/core';
import {FastifyAdapter,NestFastifyApplication}from '@nestjs/platform-fastify';
@Controller() class HealthController{@Get('/health')health(){return{ok:true,service:'ascend-api',mode:'MOCK',architecture:'management-api'}}}
@Module({controllers:[HealthController]}) class AppModule{}
async function bootstrap(){const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter());app.enableCors({origin:true,credentials:true});await app.listen(Number(process.env.API_PORT??3001),'0.0.0.0')}
bootstrap();
